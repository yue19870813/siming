import { UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { isTauri, readProjectAsset } from "../lib/projectApi";

const assetUrls = new Map<string, Promise<string>>();

function mimeType(path: string) {
  const extension = path.split(".").at(-1)?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  return "image/jpeg";
}

function loadAssetUrl(rootPath: string, relativePath: string) {
  const cacheKey = `${rootPath}\0${relativePath}`;
  const cached = assetUrls.get(cacheKey);
  if (cached) return cached;
  const request = readProjectAsset(rootPath, relativePath).then((bytes) => {
    const buffer = Uint8Array.from(bytes).buffer as ArrayBuffer;
    return URL.createObjectURL(
      new Blob([buffer], { type: mimeType(relativePath) }),
    );
  });
  assetUrls.set(cacheKey, request);
  return request;
}

export function CharacterAvatar({
  rootPath,
  avatar,
  name,
  color,
  className = "",
}: {
  rootPath: string;
  avatar?: string;
  name: string;
  color: string;
  className?: string;
}) {
  const [source, setSource] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setSource(null);
    if (!avatar || !rootPath || !isTauri()) return () => undefined;
    loadAssetUrl(rootPath, avatar)
      .then((url) => {
        if (active) setSource(url);
      })
      .catch(() => {
        if (active) setSource(null);
      });
    return () => {
      active = false;
    };
  }, [avatar, rootPath]);

  return (
    <span
      className={`character-avatar ${className}`.trim()}
      style={{ "--avatar-color": color } as React.CSSProperties}
      title={name}
    >
      {source ? (
        <img src={source} alt={`${name}头像`} />
      ) : (
        <UserRound aria-hidden="true" />
      )}
    </span>
  );
}
