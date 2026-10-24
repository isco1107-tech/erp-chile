export const dynamic = 'force-static';
export function GET() {
  return new Response(
    "self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));",
    {
      headers: {
        'Content-Type': 'application/javascript',
        'Cache-Control': 'no-cache',
        'Service-Worker-Allowed': '/control',
      },
    },
  );
}
