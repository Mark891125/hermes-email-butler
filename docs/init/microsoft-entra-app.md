应用程序(客户端) ID  b894445f-f715-4dff-8f74-86d8b8a0d70e
对象 ID  972839da-9eb6-492c-8ad1-81a3049db789
目录(租户) ID  e7b61d89-1239-4755-a034-273e687387e0


##客户端 -hermes-agent
密码 ：HJk8Q~pgYUPZ59LHiDmN6suYgDhpQE_H6GA8CbtP
KEY ：8ac7740b-c40c-4ae8-908d-99a0fff161f5


MICROSOFT_CLIENT_ID=b894445f-f715-4dff-8f74-86d8b8a0d70e
MICROSOFT_TENANT_ID=e7b61d89-1239-4755-a034-273e687387e0
MICROSOFT_CLIENT_SECRET=HJk8Q~pgYUPZ59LHiDmN6suYgDhpQE_H6GA8CbtP
MICROSOFT_REDIRECT_URI=http://localhost:3000/auth/callback

entra id 登录地址样例：
https://login.microsoftonline.com/e7b61d89-1239-4755-a034-273e687387e0/oauth2/v2.0/authorize
?client_id=b894445f-f715-4dff-8f74-86d8b8a0d70e
&response_type=code
&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Fcallback
&response_mode=query
&scope=offline_access%20User.Read%20Mail.Read
&state=12345