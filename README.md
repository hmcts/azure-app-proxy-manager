# azure-app-proxy-manager

This tool allows you to manage Azure AD Application Proxy applications from a YAML file.
It is based on the [Configure Application Proxy using the Microsoft Graph API](https://learn.microsoft.com/en-us/graph/application-proxy-configure-api?tabs=http) tutorial by Microsoft.

Its goal is to allow you to completely manage your application proxy applications in a declarative way.

## Prerequisites

- Azure AD Premium P1 or P2 license.
- Application administrator role or `Directory.ReadWrite.All` Graph API permission.
- [Azure CLI](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli)
- [Node.js](https://nodejs.org/en/download/) 18 or higher
- [Yarn](https://yarnpkg.com/getting-started/install)

## Installing app proxy

See [Azure Active Directory Application Proxy Implementation](https://luke.geek.nz/azure/azure-active-directory-application-proxy-implementation/)

## Configuring app proxy

Create a YAML file with your applications in it. See the [sample](apps.yaml) to get started.

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

- [ ] SAML auth
- [ ] Blog

## Contributing

You can run this locally with:

```bash
yarn install
yarn build
yarn node --enable-source-maps lib/main.js --config apps.yaml
```

### Tests

Login to Azure with an account that has the Application Administrator role in the tenant.
It's recommended you use a sandbox tenant for this.

Then run:

```bash
yarn test
```
