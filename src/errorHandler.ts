export async function errorHandler(when: string, result: Response) {
  if (!result.ok) {
    console.log();

    let body = null;
    try {
      body = await result.json();
    } catch (err) {}
    // @ts-ignore
    throw new Error(`Error ${when}`, result.status, result.statusText, body);
  }
}
