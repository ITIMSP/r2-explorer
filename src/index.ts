import { R2Explorer } from 'r2-explorer';

const BASE_URL = "https://r2-explorer.itimsp.workers.dev"; // Update if different

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Handle /download/<filename>
    if (pathname.startsWith("/download/")) {
      const key = decodeURIComponent(pathname.slice("/download/".length));
      if (!key) return new Response("Missing file name", { status: 400 });

      const object = await env.bucket.get(key);
      if (!object || !object.body) return new Response("File not found", { status: 404 });

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("etag", object.httpEtag);

      return new Response(object.body, { headers });
    }

    // Let r2-explorer handle all normal routes
    env.READONLY = "false";
    const baseResponse = await R2Explorer(request, env, ctx);

    if (!(baseResponse instanceof Response)) {
      return new Response("Unexpected output from R2Explorer", { status: 500 });
    }

    const contentType = baseResponse.headers.get("Content-Type") || "";
    if (!contentType.includes("text/html")) return baseResponse;

    const originalHtml = await baseResponse.text();

    const injectedScript = `<script>
      const BASE_URL = "${BASE_URL}";

      const injectDirectLinkButton = (row, key) => {
        const shareBtn = row.querySelector('[data-testid="share"]');
        if (!shareBtn || row.dataset.directLinkInjected) return;

        const directBtn = shareBtn.cloneNode(true);
        directBtn.title = "Get Direct Download Link";
        directBtn.querySelector("svg").outerHTML =
          '<svg xmlns="http://www.w3.org/2000/svg" fill="none" height="20" width="20" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>';

        directBtn.addEventListener("click", () => {
          const link = BASE_URL + "/download/" + encodeURIComponent(key);
          prompt("Direct Download Link", link);
        });

        shareBtn.parentElement.appendChild(directBtn);
        row.dataset.directLinkInjected = "true";
      };

      new MutationObserver(() => {
        document.querySelectorAll('[data-testid="file-row"]').forEach(row => {
          const key = row.getAttribute('data-key');
          if (key) injectDirectLinkButton(row, key);
        });
      }).observe(document.body, { childList: true, subtree: true });
    </script>`;

    const modifiedHtml = originalHtml.replace("</head>", `${injectedScript}</head>`);

    return new Response(modifiedHtml, {
      status: baseResponse.status,
      headers: {
        ...Object.fromEntries(baseResponse.headers),
        "Content-Type": "text/html; charset=UTF-8"
      }
    });
  }
};
