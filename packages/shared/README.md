# shared

共享运行时基础包含版本化 `ConfigStore` 和 AES-256-GCM `SecretVault`。配置使用原子替换和备份文件；密钥通过 opaque credential reference 与业务配置隔离。
