<div align="center">
  <img src="docs/icon.png" alt="App 图标" width="100" />
  <h1>AirHub</h1>

一个原生Android LLM 聊天客户端，支持切换不同的供应商进行聊天，基于Rikkahub进行二次开发，遵守原项目的开源协议及其相关要求（如：不进行商业化）。

</div>

<div align="center">
  <img src="docs/img/chat.png" alt="Chat Interface" width="150" />
  <img src="docs/img/desktop.png" alt="Models Picker" width="450" />
</div>


## 🚀 下载

🔗 [不定期构建](https://github.com/MengLe01/airhub/releases/tag/nightly)（不推荐，因为可能有bug）
🔗 [稳定版本（但更新速度可能较慢）](https://github.com/MengLe01/airhub/releases)（不推荐，因为功能不全）

> [!WARNING]
> RikkaHub 存在许多 fork 版本，本项目即为Rikkahub的一个 fork 。出现问题往往是因为本项目使用 vibecoding 时出现失误，与 RikkaHub 无关。
> 请谨慎使用包括本项目在内的 fork 版本，建议使用Rikkahub官方版本（或者Vibecoding二次开发）


## 💖 赞助商

本项目没有任何赞助商

## ✨ （相比原项目的）功能特色

- 更符合我的审美（侧边栏更简洁、支持粗粒度的日期分组以减少分组数、使用首字作为默认头像）
- 更符合我的需求（隐藏不常用模型、添加字数统计）
- bug更多
- 性能更差
- 更新缓慢

## ✨ （原项目的）功能特色

- 🎨 现代化安卓APP设计（Material You / 预测性返回）和 🌙 暗色模式
- 📦 工作区：基于 proot 的 Linux 智能体环境
- 🖥️ Web多端访问支持
- 🛠️ MCP 支持
- 🔄 多种类型的供应商支持，自定义 API / URL / 模型（目前支持 OpenAI、Google、Anthropic）
- 🖼️ 多模态输入支持
- 📝 Markdown 渲染（支持代码高亮、数学公式、表格、Mermaid）
- 🔍 搜索功能（Exa、Tavily、Zhipu、LinkUp、Brave、Perplexity、..）
- 🧩 Prompt 变量（模型名称、时间等）
- 🤳 二维码导出和导入提供商
- 🤖 智能体自定义
- 🧠 类ChatGPT记忆功能
- 📝 AI翻译
- 🌐 自定义HTTP请求头和请求体

## ✨ 开发

> [!IMPORTANT]
> 本项目接受 Pull Request（PR）。

本项目使用[Vibe Coding](https://en.wikipedia.org/wiki/Vibe_coding)开发。

技术栈文档:

- [Claude Code](https://github.com/anthropics/claude-code) (使用的Harness)
- [CodeX](https://github.com/openai/codex) (使用的Harness)
- [OpenCode](https://github.com/anomalyco/opencode) (使用的Harness)
- [DeepSeek](https://www.deepseek.com) (使用的LLM)
- [GPT](https://chatgpt.com) (使用的LLM)

> [!TIP]
> 你不需要在 app 文件夹下添加 google-services.json 文件就能构建应用，因为我把firebase依赖去掉了。

## 💰 捐赠

欢迎token投喂喵，欢迎token投喂谢谢喵~（

## ⭐ Star History

如果喜欢这个项目或上游项目，请给个Star⭐

（上游项目rikkahub的Star情况如下：）

<a href="https://www.star-history.com/?type=date&repos=re-ovo%2Frikkahub">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=re-ovo/rikkahub&type=date&theme=dark&legend=top-left&sealed_token=qSytWeq7LkzQQViTjK0MYlvvA_qkfuwjOxOqgbRpLUZZwok5rO6LXhpVL7Mq-q3o89BfKpzE7g66BCy18H6eiqTsD8czD0J-HejLqmHy-npcvCTHu11wZw" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=re-ovo/rikkahub&type=date&legend=top-left&sealed_token=qSytWeq7LkzQQViTjK0MYlvvA_qkfuwjOxOqgbRpLUZZwok5rO6LXhpVL7Mq-q3o89BfKpzE7g66BCy18H6eiqTsD8czD0J-HejLqmHy-npcvCTHu11wZw" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=re-ovo/rikkahub&type=date&legend=top-left&sealed_token=qSytWeq7LkzQQViTjK0MYlvvA_qkfuwjOxOqgbRpLUZZwok5rO6LXhpVL7Mq-q3o89BfKpzE7g66BCy18H6eiqTsD8czD0J-HejLqmHy-npcvCTHu11wZw" />
 </picture>
</a>

## 📄 许可证

本项目基于 [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0) 开源。
