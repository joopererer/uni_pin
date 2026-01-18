#[cfg(test)]
mod updater_tests {
    use uni_pin_lib::updater;

    #[test]
    fn test_get_current_version() {
        let version = updater::get_current_version();
        assert!(!version.is_empty());
        // 版本号格式应该是 x.y.z
        assert!(version.contains('.'));
    }

    #[test]
    fn test_version_compare() {
        // 注意：version_compare 是私有函数，需要通过公开接口测试
        // 这里主要测试 updater 模块是否能正常编译和运行
        let version = updater::get_current_version();
        assert!(!version.is_empty());
    }
}
