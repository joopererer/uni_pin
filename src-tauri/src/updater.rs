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

/// 检查更新
pub async fn check_for_updates() -> Result<Option<GitHubRelease>, String> {
    let current_version = get_current_version();
    let repo = "joopererer/uni_stick"; // GitHub 仓库

    let url = format!("https://api.github.com/repos/{}/releases/latest", repo);
    
    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .header("User-Agent", "UniStick-Updater")
        .send()
        .await
        .map_err(|e| format!("网络请求失败: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("获取更新信息失败: {}", response.status()));
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
}
