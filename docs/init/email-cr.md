# 整体目标
建设一个本地运行的 Outlook 邮件处理系统。
系统通过 Microsoft OAuth 登录授权，使用 Microsoft Graph 读取用户邮箱，定期同步新增/变更邮件，判断哪些邮件需要处理，为后续汇总与提醒完成邮件数据的基础工程
不依赖公网地址，不托管在 Azure，不接管邮箱，不自动回复邮件。n

# Phase1
授权与 token 获取，cli 实现 hd auth 命令，用于获取 Microsoft OAuth token。
浏览器跳转到 Microsoft 登录地址：https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/authorize
?client_id={CLIENT_ID}
&response_type=code
&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Fcallback
&response_mode=query
&scope=offline_access%20User.Read%20Mail.Read
&state=12345 
命令启动一个服务，实现一个接口 /auth/callback，用于接收 Microsoft OAuth 回调。

系统可以拆成 授权层、邮件同步层、汇总管理层、Hermes CLI 层,稳定保存 token、定时拉邮件、登记状态、生成报告。

