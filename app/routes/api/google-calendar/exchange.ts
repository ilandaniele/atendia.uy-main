/**
 * Intercambia la cookie temporal gcal_token por el refresh_token.
 * Llamado via POST desde el cliente después del redirect de callback.
 * De un solo uso: borra la cookie al leer.
 */
export async function action({ request }: { request: Request }) {
    const cookieHeader = request.headers.get("Cookie") ?? "";
    const cookies = cookieHeader.split(";").map((c) => c.trim());

    const findCookie = (name: string) =>
        cookies.find((c) => c.startsWith(`${name}=`))?.split("=").slice(1).join("=");

    const rawToken = findCookie("gcal_token");
    const rawEmail = findCookie("gcal_email");
    const rawName = findCookie("gcal_name");
    const rawPicture = findCookie("gcal_picture");

    const clearHeaders: [string, string][] = [
        ["Content-Type", "application/json"],
        ["Set-Cookie", "gcal_token=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0"],
        ["Set-Cookie", "gcal_email=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0"],
        ["Set-Cookie", "gcal_name=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0"],
        ["Set-Cookie", "gcal_picture=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0"],
    ];

    if (!rawToken) {
        return new Response(JSON.stringify({ error: "no_token" }), {
            status: 400,
            headers: new Headers(clearHeaders),
        });
    }

    return new Response(JSON.stringify({
        refreshToken: decodeURIComponent(rawToken),
        email: rawEmail ? decodeURIComponent(rawEmail) : undefined,
        name: rawName ? decodeURIComponent(rawName) : undefined,
        picture: rawPicture ? decodeURIComponent(rawPicture) : undefined,
    }), {
        status: 200,
        headers: new Headers(clearHeaders),
    });
}
