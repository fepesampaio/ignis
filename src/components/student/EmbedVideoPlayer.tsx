import { AspectRatio } from '@/components/ui/aspect-ratio';

interface EmbedVideoPlayerProps {
  videoUrl: string;
  title?: string;
  className?: string;
}

function getEmbedUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  // If user pasted full HTML embed code, extract the iframe src
  const iframeSrcMatch = trimmed.match(/<iframe[^>]+src=["']([^"']+)["']/i);
  if (iframeSrcMatch?.[1]) {
    // Decode HTML entities (e.g. &amp; → &)
    return iframeSrcMatch[1].replace(/&amp;/g, '&');
  }

  // YouTube URL → convert to embed
  const ytMatch = trimmed.match(
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/
  );
  if (ytMatch?.[1]) {
    return `https://www.youtube.com/embed/${ytMatch[1]}`;
  }

  // Any other http(s) URL → use directly as embed src
  if (trimmed.startsWith('http')) {
    return trimmed;
  }

  return null;
}

export function EmbedVideoPlayer({ videoUrl, title = 'Vídeo', className }: EmbedVideoPlayerProps) {
  const embedUrl = getEmbedUrl(videoUrl);

  if (!embedUrl) {
    return (
      <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
        <p className="text-muted-foreground">URL de vídeo inválida</p>
      </div>
    );
  }

  return (
    <div className={className}>
      <AspectRatio ratio={16 / 9}>
        <iframe
          src={embedUrl}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="w-full h-full rounded-lg"
        />
      </AspectRatio>
    </div>
  );
}
