import { DefaultAzureCredential } from "@azure/identity";

export async function authenticate() {
  const credential = new DefaultAzureCredential();

  const { token } = await credential.getToken(
    "https://graph.microsoft.com/.default",
  );

  return token;
}
