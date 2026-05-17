import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

interface BunnyVideoPlayerProps {
  videoUrl: string;
  title?: string;
}

export function BunnyVideoPlayer({ videoUrl, title }: BunnyVideoPlayerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const getEmbedUrl = (url: string): string => {
    let baseUrl = url;

    if (url.includes("iframe.mediadelivery.net/embed")) {
      baseUrl = url;
    } else if (url.includes("video.bunnycdn.com/play")) {
      baseUrl = url.replace("video.bunnycdn.com/play", "iframe.mediadelivery.net/embed");
    } else {
      const bunnyPattern = /(?:bunnycdn\.com|mediadelivery\.net)\/(?:play|embed)\/(\d+)\/([a-zA-Z0-9-]+)/;
      const match = url.match(bunnyPattern);

      if (match) {
        baseUrl = `https://iframe.mediadelivery.net/embed/${match[1]}/${match[2]}`;
      } else if (url.startsWith("http")) {
        try {
          const urlObj = new URL(url);
          const pathParts = urlObj.pathname.split("/").filter(Boolean);

          if (pathParts.length >= 2) {
            const libraryId = pathParts[pathParts.length - 2];
            const videoId = pathParts[pathParts.length - 1];

            if (/^\d+$/.test(libraryId)) {
              baseUrl = `https://iframe.mediadelivery.net/embed/${libraryId}/${videoId}`;
            }
          }
        } catch {
          // Keep original URL when parsing fails.
        }
      }
    }

    const separator = baseUrl.includes("?") ? "&" : "?";
    return `${baseUrl}${separator}autoplay=false`;
  };

  const embedUrl = getEmbedUrl(videoUrl);

  if (hasError) {
    return (
      <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
        <div className="text-center text-muted-foreground p-4">
          <p className="font-medium">Erro ao carregar o video</p>
          <p className="text-sm mt-1">Verifique as configuracoes de seguranca no Bunny.net:</p>
          <ul className="text-xs mt-2 text-left max-w-md mx-auto space-y-1">
            <li>- Adicione o dominio atual da plataforma aos Allowed Referrers</li>
            <li>- Verifique se "Block Direct URL Access" esta desabilitado</li>
            <li>- Confirme que Token Authentication esta desativado</li>
          </ul>
          <p className="text-xs mt-3 opacity-60 break-all">URL: {embedUrl}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
      {isLoading && <Skeleton className="absolute inset-0 w-full h-full" />}
      <iframe
        src={embedUrl}
        title={title || "Video da aula"}
        className="absolute inset-0 w-full h-full"
        frameBorder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setIsLoading(false);
          setHasError(true);
        }}
      />
    </div>
  );
}
