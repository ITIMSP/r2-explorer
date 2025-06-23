import { R2Explorer } from 'r2-explorer';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Direct download API
    if (pathname.startsWith("/api/direct-download")) {
      const key = url.searchParams.get("key");
      if (!key) return new Response("Missing key", { status: 400 });

      const object = await env.bucket.head(key);
      if (!object) return new Response("Object not found", { status: 404 });

      const signedUrl = await env.bucket.createPresignedUrl(key, {
        method: "GET"
      });

      return new Response(JSON.stringify({ url: signedUrl.toString() }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Set READONLY override for R2Explorer
    env.READONLY = "false";

    const baseResponse = await R2Explorer(request, env, ctx);

    if (baseResponse instanceof Response) {
      const contentType = baseResponse.headers.get("Content-Type") || "";
      if (contentType.includes("text/html")) {
        const originalHtml = await baseResponse.text();

        const injectedCSS = `<style></style>`;

        const injectedScript = `<script>
          const injectDownloadButton = (row, key) => {
            const shareBtn = row.querySelector('[data-testid="share"]');
            if (!shareBtn || row.dataset.downloadInjected) return;
            const btn = shareBtn.cloneNode(true);
            btn.title = "Get Download Link";
            btn.querySelector("svg").outerHTML = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" height="20" width="20" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>';
            btn.addEventListener("click", async () => {
              try {
                const res = await fetch('/api/direct-download?key=' + encodeURIComponent(key));
                const data = await res.json();
                prompt("Direct Download Link", data.url);
              } catch {
                alert("Failed to fetch download link");
              }
            });
            shareBtn.parentElement.appendChild(btn);
            row.dataset.downloadInjected = "true";
          };

          const hideEmailSidebarButton = () => {
            document.querySelectorAll("button.q-btn").forEach(btn => {
              const text = btn.innerText.trim().toLowerCase();
              if (text === "email") {
                btn.style.display = "none";
              }
            });
          };

          new MutationObserver(() => {
            document.querySelectorAll('[data-testid="file-row"]').forEach(row => {
              const key = row.getAttribute('data-key');
              if (key) injectDownloadButton(row, key);
            });
            hideEmailSidebarButton();
          }).observe(document.body, { childList: true, subtree: true });
        </script>`;

        const modifiedHtml = originalHtml.replace(
          "</head>",
          `${injectedCSS}${injectedScript}</head>`
        );

        return new Response(modifiedHtml, {
          status: baseResponse.status,
          headers: {
            ...Object.fromEntries(baseResponse.headers),
            "Content-Type": "text/html; charset=UTF-8"
          }
        });
      }

      return baseResponse;
    }

    return new Response("Unexpected output from R2Explorer", { status: 500 });
  }
};
