import { useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

interface BunnyVideoPlayerProps {
  videoUrl: string;
  title?: string;
}

export function BunnyVideoPlayer({ videoUrl, title }: BunnyVideoPlayerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // Parse Bunny video URL to extract video ID
  // Bunny URLs can be in different formats:
  // - https://iframe.mediadelivery.net/embed/{libraryId}/{videoId}
  // - https://video.bunnycdn.com/play/{libraryId}/{videoId}
  // - Direct video ID
  const getEmbedUrl = (url: string): string => {
    let baseUrl = url;
    
    // If it's already an embed URL, use it
    if (url.includes('iframe.mediadelivery.net/embed')) {
      baseUrl = url;
    }
    // If it's a play URL, convert to embed
    else if (url.includes('video.bunnycdn.com/play')) {
      baseUrl = url.replace('video.bunnycdn.com/play', 'iframe.mediadelivery.net/embed');
    }
    // If it contains a library ID and video ID pattern
    else {
      const bunnyPattern = /(?:bunnycdn\.com|mediadelivery\.net)\/(?:play|embed)\/(\d+)\/([a-zA-Z0-9-]+)/;
      const match = url.match(bunnyPattern);
      if (match) {
        baseUrl = `https://iframe.mediadelivery.net/embed/${match[1]}/${match[2]}`;
      }
      // If it's just the full URL with video ID, try to use it directly
      else if (url.startsWith('http')) {
        try {
          const urlObj = new URL(url);
          const pathParts = urlObj.pathname.split('/').filter(Boolean);
          if (pathParts.length >= 2) {
            const libraryId = pathParts[pathParts.length - 2];
            const videoId = pathParts[pathParts.length - 1];
            if (/^\d+$/.test(libraryId)) {
              baseUrl = `https://iframe.mediadelivery.net/embed/${libraryId}/${videoId}`;
            }
          }
        } catch {
          // If URL parsing fails, return as is
        }
      }
    }

    // Add autoplay=false parameter to prevent auto-playing
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}autoplay=false`;
  };

  const embedUrl = getEmbedUrl(videoUrl);

  if (hasError) {
    return (
      <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
        <div className="text-center text-muted-foreground p-4">
          <p className="font-medium">Erro ao carregar o vídeo</p>
          <p className="text-sm mt-1">Verifique as configurações de segurança no Bunny.net:</p>
          <ul className="text-xs mt-2 text-left max-w-md mx-auto space-y-1">
            <li>• Adicione <code className="bg-muted-foreground/20 px-1 rounded">*.lovableproject.com</code> aos Allowed Referrers</li>
            <li>• Verifique se "Block Direct URL Access" está desabilitado</li>
            <li>• Confirme que Token Authentication está desativado</li>
          </ul>
          <p className="text-xs mt-3 opacity-60 break-all">URL: {embedUrl}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
      {isLoading && (
        <Skeleton className="absolute inset-0 w-full h-full" />
      )}
      <iframe
        src={embedUrl}
        title={title || 'Vídeo da aula'}
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
