# azure-app-proxy-manager

## Prerequisites

App Admin in local tenant
license?

## Installing app proxy

## Configuring app proxy

```bash
yarn dlx azure-app-proxy-manager --config apps.yaml
```

### apps.yaml schema

There is a JSON schema provided at [apps.schema.json](apps.schema.json)
This is the quickest and easiest way to configure an app with autocompletion and documentation on the properties.

IDE Configuration:

- [IntelliJ](https://www.jetbrains.com/help/idea/json.html#ws_json_schema_add_custom)
- [VSCode](https://github.com/redhat-developer/vscode-yaml#associating-a-schema-to-a-glob-pattern-via-yamlschemas)

## Features to be implemented

- [ ] SSL certificate
- [ ] Possibly allow setting boolean values on per app basic if required
- [ ] README
- [ ] Tests
- [ ] Blog
- [ ] Visible to users

### Notes

SSL certificate
https://github.com/hmcts/cvp-audio-ingress/blob/8b53ce29176e7aa515f5d4b30318f5909d89a288/terraform/cloudconfig/cloudconfig.tpl#L890

https://learn.microsoft.com/en-us/graph/api/resources/onpremisespublishing?view=graph-rest-beta
https://learn.microsoft.com/en-us/graph/api/resources/keycredential?view=graph-rest-beta

```json
{
  "onPremisesPublishing": {
    "verifiedCustomDomainKeyCredential": {
      "type": "X509CertAndPassword",
      "keyId": "",
      "value": ["byte array"]
    },
    "verifiedCustomDomainPasswordCredential": {
      "value": "Password12"
    }
  }
}
```

## Contributing

You can run this locally with:

```bash
yarn install
yarn tsc -p .
yarn node dist/index.js --config apps.yaml
```
