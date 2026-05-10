use serde::{Deserialize, Serialize};

/// GitHub Release 信息
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct GitHubRelease {
    pub tag_name: String,
    pub name: String,
    pub body: String,
    pub published_at: String,
    pub assets: Vec<ReleaseAsset>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ReleaseAsset {
    pub name: String,
    pub browser_download_url: String,
    pub size: u64,
}

/// 获取当前版本号
pub fn get_current_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

/// 从 `/etc/os-release` 读取主版本（如 `22`、`24`），非 Linux 或未识别时返回 `None`
#[cfg(target_os = "linux")]
fn read_os_release_major_version() -> Option<u8> {
    let content = std::fs::read_to_string("/etc/os-release").ok()?;
    for line in content.lines() {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix("VERSION_ID=") {
            let vid = rest
                .trim()
                .trim_matches('"')
                .split('.')
                .next()?
                .parse::<u8>()
                .ok()?;
            return Some(vid);
        }
    }
    None
}

/// 在多条 Linux 工件（CI 上会产出带 `ubuntu22.04` / `ubuntu24.04` 后缀的包）中挑选 URL
#[cfg(any(test, target_os = "linux"))]
fn linux_pick_download_with_major_hint(
    release: &GitHubRelease,
    version_major_hint: Option<u8>,
) -> Option<String> {
    fn tagged_for_22(name: &str) -> bool {
        let n = name.to_lowercase();
        n.contains("ubuntu22.04") || n.contains("jammy") || n.contains("_22.04.")
    }

    fn tagged_for_24(name: &str) -> bool {
        let n = name.to_lowercase();
        n.contains("ubuntu24.04") || n.contains("noble") || n.contains("_24.04.")
    }

    fn legacy_untagged(name: &str) -> bool {
        !(tagged_for_22(name) || tagged_for_24(name))
    }

    fn pick(
        assets: &[ReleaseAsset],
        ends_with: &str,
        major: Option<u8>,
    ) -> Option<&ReleaseAsset> {
        let cand: Vec<&ReleaseAsset> = assets.iter().filter(|a| a.name.ends_with(ends_with)).collect();
        if cand.is_empty() {
            return None;
        }

        match major {
            Some(22) => cand
                .iter()
                .find(|a| tagged_for_22(&a.name))
                .copied()
                .or_else(|| cand.iter().find(|a| legacy_untagged(&a.name)).copied())
                .or_else(|| cand.first().copied()),
            Some(24) => cand
                .iter()
                .find(|a| tagged_for_24(&a.name))
                .copied()
                .or_else(|| cand.iter().find(|a| legacy_untagged(&a.name)).copied())
                .or_else(|| cand.first().copied()),
            _ => cand
                .iter()
                .find(|a| legacy_untagged(&a.name))
                .copied()
                .or_else(|| cand.first().copied()),
        }
    }

    pick(&release.assets, ".deb", version_major_hint)
        .map(|a| a.browser_download_url.clone())
        .or_else(|| {
            pick(&release.assets, ".AppImage", version_major_hint)
                .map(|a| a.browser_download_url.clone())
        })
}

/// 按当前操作系统从 Release 资产中选择最合适的下载链接
pub fn download_url_for_current_platform(release: &GitHubRelease) -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        release
            .assets
            .iter()
            .find(|a| a.name.ends_with(".msi"))
            .or_else(|| release.assets.iter().find(|a| a.name.ends_with(".exe")))
            .map(|a| a.browser_download_url.clone())
    }
    #[cfg(target_os = "linux")]
    {
        let major = read_os_release_major_version();
        linux_pick_download_with_major_hint(release, major)
    }
    #[cfg(target_os = "macos")]
    {
        release
            .assets
            .iter()
            .find(|a| a.name.ends_with(".dmg"))
            .map(|a| a.browser_download_url.clone())
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
    {
        release
            .assets
            .first()
            .map(|a| a.browser_download_url.clone())
    }
}

/// 检查更新
pub async fn check_for_updates() -> Result<Option<GitHubRelease>, String> {
    let current_version = get_current_version();
    let repo = "joopererer/uni_pin"; // GitHub repository

    let url = format!("https://api.github.com/repos/{}/releases/latest", repo);
    
    // 创建带超时的客户端
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10)) // 10 秒超时
        .build()
        .map_err(|e| format!("创建HTTP客户端失败: {}", e))?;
    
    let response = client
        .get(&url)
        .header("User-Agent", "UniPin-Updater")
        .header("Accept", "application/vnd.github.v3+json")
        .send()
        .await
        .map_err(|e| {
            // 提供更友好的错误信息
            if e.is_timeout() {
                "网络请求超时，请检查网络连接".to_string()
            } else if e.is_connect() {
                "无法连接到服务器，请检查网络连接".to_string()
            } else {
                format!("网络请求失败: {}", e)
            }
        })?;

    let status = response.status();
    if !status.is_success() {
        if status == reqwest::StatusCode::NOT_FOUND {
            return Err("仓库未找到或尚未发布版本".to_string());
        } else if status == reqwest::StatusCode::FORBIDDEN {
            return Err("访问被拒绝，请稍后重试".to_string());
        } else {
            return Err(format!("获取更新信息失败: HTTP {}", status.as_u16()));
        }
    }

    let release: GitHubRelease = response
        .json()
        .await
        .map_err(|e| format!("解析更新信息失败: {}", e))?;

    // 比较版本号
    let latest_version = release.tag_name.trim_start_matches('v');
    if version_compare(latest_version, current_version) > 0 {
        Ok(Some(release))
    } else {
        Ok(None)
    }
}

/// 简单的版本比较函数（公开用于测试）
/// 返回：1 = latest > current, 0 = 相等, -1 = latest < current
pub fn version_compare(latest: &str, current: &str) -> i32 {
    let latest_parts: Vec<u32> = latest
        .split('.')
        .map(|s| s.parse().unwrap_or(0))
        .collect();
    let current_parts: Vec<u32> = current
        .split('.')
        .map(|s| s.parse().unwrap_or(0))
        .collect();

    let max_len = latest_parts.len().max(current_parts.len());
    
    for i in 0..max_len {
        let latest_part = latest_parts.get(i).copied().unwrap_or(0);
        let current_part = current_parts.get(i).copied().unwrap_or(0);
        
        if latest_part > current_part {
            return 1;
        } else if latest_part < current_part {
            return -1;
        }
    }
    
    0
}

#[cfg(all(test, target_os = "linux"))]
#[test]
fn download_url_prefers_deb_on_linux() {
    let release = GitHubRelease {
        tag_name: "v1.0.0".into(),
        name: "r".into(),
        body: "".into(),
        published_at: "".into(),
        assets: vec![
            ReleaseAsset {
                name: "UniPin_x64-setup.exe".into(),
                browser_download_url: "http://win".into(),
                size: 0,
            },
            ReleaseAsset {
                name: "uni-pin_0.2.1_amd64.deb".into(),
                browser_download_url: "http://deb".into(),
                size: 0,
            },
            ReleaseAsset {
                name: "uni-pin_0.2.1_amd64.AppImage".into(),
                browser_download_url: "http://appimage".into(),
                size: 0,
            },
        ],
    };
    assert_eq!(
        download_url_for_current_platform(&release).as_deref(),
        Some("http://deb")
    );
}

#[cfg(all(test, target_os = "windows"))]
#[test]
fn download_url_prefers_msi_on_windows() {
    let release = GitHubRelease {
        tag_name: "v1.0.0".into(),
        name: "r".into(),
        body: "".into(),
        published_at: "".into(),
        assets: vec![
            ReleaseAsset {
                name: "uni-pin_0.2.1_amd64.deb".into(),
                browser_download_url: "http://deb".into(),
                size: 0,
            },
            ReleaseAsset {
                name: "UniPin_0.2.1_x64_en-US.msi".into(),
                browser_download_url: "http://msi".into(),
                size: 0,
            },
        ],
    };
    assert_eq!(
        download_url_for_current_platform(&release).as_deref(),
        Some("http://msi")
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_version_compare() {
        assert_eq!(version_compare("0.2.0", "0.1.0"), 1);
        assert_eq!(version_compare("0.1.0", "0.2.0"), -1);
        assert_eq!(version_compare("0.1.0", "0.1.0"), 0);
        assert_eq!(version_compare("1.0.0", "0.9.9"), 1);
    }

    #[test]
    fn linux_pick_hints_distinguish_ubuntu_22_vs_24() {
        let release = GitHubRelease {
            tag_name: "v1.0.0".into(),
            name: "r".into(),
            body: "".into(),
            published_at: "".into(),
            assets: vec![
                ReleaseAsset {
                    name: "uni-pin_0.2.1_amd64.ubuntu24.04.deb".into(),
                    browser_download_url: "http://deb-24".into(),
                    size: 0,
                },
                ReleaseAsset {
                    name: "uni-pin_0.2.1_amd64.ubuntu22.04.deb".into(),
                    browser_download_url: "http://deb-22".into(),
                    size: 0,
                },
            ],
        };
        assert_eq!(
            linux_pick_download_with_major_hint(&release, Some(22)).as_deref(),
            Some("http://deb-22")
        );
        assert_eq!(
            linux_pick_download_with_major_hint(&release, Some(24)).as_deref(),
            Some("http://deb-24")
        );
    }

    #[test]
    fn linux_pick_falls_back_to_legacy_untagged_deb() {
        let release = GitHubRelease {
            tag_name: "v1.0.0".into(),
            name: "r".into(),
            body: "".into(),
            published_at: "".into(),
            assets: vec![ReleaseAsset {
                name: "uni-pin_0.2.1_amd64.deb".into(),
                browser_download_url: "http://legacy".into(),
                size: 0,
            }],
        };
        assert_eq!(
            linux_pick_download_with_major_hint(&release, None).as_deref(),
            Some("http://legacy")
        );
        assert_eq!(
            linux_pick_download_with_major_hint(&release, Some(99)).as_deref(),
            Some("http://legacy")
        );
    }
}
