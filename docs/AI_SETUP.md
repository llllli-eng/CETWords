# AI 中文释义巩固配置

第 10 阶段把 DeepSeek 调用放在独立的 Cloudflare Worker 中。浏览器只保存代理地址和个人访问 Token，永远拿不到 DeepSeek API Key。

## 本地开发

1. 进入 `worker` 目录并安装依赖：

   ```powershell
   pnpm install
   ```

2. 将 `.dev.vars.example` 复制为 `.dev.vars`，填入自己的值：

   ```text
   DEEPSEEK_API_KEY=你的_DeepSeek_API_Key
   APP_PROXY_TOKEN=一段足够长且随机的个人Token
   ```

   `.dev.vars` 已被 `.gitignore` 排除，不能提交。

3. 启动 Worker：

   ```powershell
   pnpm dev
   ```

4. 通过本地 HTTP 服务打开拾词前端。在设置页填写：

   ```text
   API 代理地址：http://localhost:8787
   个人访问 Token：与 APP_PROXY_TOKEN 相同
   ```

5. 点击“保存并测试连接”。连接成功后，只有新词的“当日巩固”会改用中文释义输入；初学、到期复习、错词本和收藏仍是四选一。

如果前端不是从 `http://localhost:8000` 或 `http://localhost:4173` 打开，请同步修改 `worker/wrangler.jsonc` 中的 `ALLOWED_ORIGINS`。

## 部署到 Cloudflare

1. 登录 Wrangler：

   ```powershell
   pnpm exec wrangler login
   ```

2. 将生产前端来源加入 `ALLOWED_ORIGINS`。多个来源用英文逗号分隔，不要使用 `*`。

3. 写入两个生产 Secret：

   ```powershell
   pnpm exec wrangler secret put DEEPSEEK_API_KEY
   pnpm exec wrangler secret put APP_PROXY_TOKEN
   ```

4. 部署 Worker：

   ```powershell
   pnpm deploy
   ```

5. 在拾词设置页填写部署后的 `workers.dev` 地址和同一个 `APP_PROXY_TOKEN`，再测试连接。

## 安全边界

- DeepSeek Key 只存在于 Worker Secret 或本机未提交的 `.dev.vars`。
- Worker 同时校验来源白名单与 `X-App-Token`，并且只接受固定字段。
- 前端不能指定模型、提示词、API 地址、温度或 token 上限。
- 每次只发送当前单词的词性、标准释义和本次回答，不发送整份词库或学习历史。
- 学习数据备份不会包含个人访问 Token；换设备后需要重新填写。
- 若 AI 超时或不可用，页面允许用户自行判定或稍后再试，学习流程不会卡死。
