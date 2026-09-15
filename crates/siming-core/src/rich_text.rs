use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum TextContent {
    Plain(String),
    Rich(RichText),
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RichText {
    pub version: u32,
    pub runs: Vec<TextRun>,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TextRun {
    pub text: String,
    #[serde(
        default,
        deserialize_with = "present_option",
        skip_serializing_if = "Option::is_none"
    )]
    pub style: Option<TextStyle>,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(deny_unknown_fields)]
pub struct TextStyle {
    #[serde(
        default,
        deserialize_with = "present_option",
        skip_serializing_if = "Option::is_none"
    )]
    pub bold: Option<bool>,
    #[serde(
        default,
        deserialize_with = "present_option",
        skip_serializing_if = "Option::is_none"
    )]
    pub italic: Option<bool>,
    #[serde(
        default,
        deserialize_with = "present_option",
        skip_serializing_if = "Option::is_none"
    )]
    pub color: Option<String>,
}
pub type LocalizedBody = BTreeMap<String, TextContent>;
impl TextContent {
    pub fn plain_text(&self) -> String {
        match self {
            Self::Plain(text) => text.clone(),
            Self::Rich(text) => text.runs.iter().map(|run| run.text.as_str()).collect(),
        }
    }
    pub fn valid(&self) -> bool {
        match self {
            Self::Plain(_) => true,
            Self::Rich(text) => {
                text.version == 1
                    && text.runs.iter().all(|run| {
                        run.style
                            .as_ref()
                            .and_then(|style| style.color.as_ref())
                            .is_none_or(|color| {
                                color.len() == 7
                                    && color.starts_with('#')
                                    && color[1..].bytes().all(|c| c.is_ascii_hexdigit())
                            })
                    })
            }
        }
    }
}
impl From<String> for TextContent {
    fn from(text: String) -> Self {
        Self::Plain(text)
    }
}
impl PartialEq<str> for TextContent {
    fn eq(&self, other: &str) -> bool {
        self.plain_text() == other
    }
}
impl PartialEq<&str> for TextContent {
    fn eq(&self, other: &&str) -> bool {
        self.plain_text() == *other
    }
}
pub fn resolve_body<'a>(
    text: &'a LocalizedBody,
    locale: &str,
    default: &str,
) -> Result<(&'a TextContent, bool), &'static str> {
    if let Some(value) = text
        .get(locale)
        .filter(|value| !value.plain_text().trim().is_empty())
    {
        return Ok((value, false));
    }
    text.get(default)
        .filter(|value| !value.plain_text().trim().is_empty())
        .map(|value| (value, true))
        .ok_or("请求语言和默认语言文本均缺失")
}

fn present_option<'de, D: serde::Deserializer<'de>, T: Deserialize<'de>>(
    deserializer: D,
) -> Result<Option<T>, D::Error> {
    T::deserialize(deserializer).map(Some)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn strict_styles_versions_and_complete_locale_fallback() {
        let body: LocalizedBody = serde_json::from_value(serde_json::json!({"zh-CN":{"version":1,"runs":[{"text":"中文","style":{"bold":true,"italic":true,"color":"#123ABC"}}]},"en-US":" "})).unwrap();
        let (text, fallback) = resolve_body(&body, "en-US", "zh-CN").unwrap();
        assert!(fallback && text.valid());
        assert_eq!(text, &body["zh-CN"]);
        for invalid in [
            serde_json::json!({"version":99,"runs":[]}),
            serde_json::json!({"version":1,"runs":[{"text":"x","style":{"color":"red"}}]}),
        ] {
            assert!(
                !serde_json::from_value::<TextContent>(invalid)
                    .unwrap()
                    .valid()
            );
        }
        for invalid in [
            serde_json::json!({"version":1,"runs":[{"text":"x","style":null}]}),
            serde_json::json!({"version":1,"runs":[{"text":"x","style":{"bold":null}}]}),
            serde_json::json!({"version":1,"runs":[{"text":"x","style":{"font":"script"}}]}),
        ] {
            assert!(serde_json::from_value::<TextContent>(invalid).is_err());
        }
    }
}
