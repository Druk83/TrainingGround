// Simple integration test for content validation

#[cfg(all(test, not(target_os = "windows")))]
mod tests {
    // Test PII detection
    #[test]
    fn test_email_detection() {
        let content = "Contact me at admin@example.com for details";
        let email_regex =
            regex::Regex::new(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}").unwrap();
        assert!(email_regex.is_match(content));
    }

    #[test]
    fn test_phone_detection() {
        let content = "Call me at 1234567890";
        let phone_regex = regex::Regex::new(r"\b\d{10,}\b").unwrap();
        assert!(phone_regex.is_match(content));
    }

    #[test]
    fn test_clean_content() {
        let content = "Это чистый контент без PII";
        let email_regex =
            regex::Regex::new(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}").unwrap();
        let phone_regex = regex::Regex::new(r"\b\d{10,}\b").unwrap();

        assert!(!email_regex.is_match(content));
        assert!(!phone_regex.is_match(content));
    }

    // Test blacklist
    #[test]
    fn test_blacklist_detection() {
        let blacklist = ["xxx", "запрещенное", "наркотик"];
        let bad_content = "Этот текст содержит xxx контент";

        let found = blacklist
            .iter()
            .any(|word| bad_content.to_lowercase().contains(word));
        assert!(found);
    }

    #[test]
    fn test_blacklist_clean() {
        let blacklist = ["xxx", "запрещенное", "наркотик"];
        let clean_content = "Обычный образовательный контент";

        let found = blacklist
            .iter()
            .any(|word| clean_content.to_lowercase().contains(word));
        assert!(!found);
    }
}
