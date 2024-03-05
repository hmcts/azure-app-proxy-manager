import {errorHandler} from '../errorHandler.js';

/*
* This function finds applications by displayName
* @param displayName - the display name of the application
* @param token - the token to authenticate the request
 */
export async function findApplicationsByName(displayName: string, token: string) {
  const url = `https://graph.microsoft.com/v1.0/applications?$filter=startswith(displayName, '${displayName}')&$count=true`;

  const result = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  await errorHandler("finding applications by displayName", result);

  const body = await result.json();
  return body.value;
}