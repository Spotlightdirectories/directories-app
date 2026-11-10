// <Image> for cards and lists that shows a photo's small copy (see
// lib/thumbUrl.ts) and switches to the full photo if the small copy can't
// load. Pass the ORIGINAL photo URL as `uri`; other props are the same as
// React Native's <Image>, except `source`.
import { useState } from "react";
import { Image, type ImageProps } from "react-native";
import { thumbUrl } from "../lib/thumbUrl";

type Props = Omit<ImageProps, "source"> & { uri: string };

export default function ThumbImage({ uri, onError, ...rest }: Props) {
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const current = failedFor === uri ? uri : thumbUrl(uri);
  return (
    <Image
      {...rest}
      source={{ uri: current }}
      onError={(e) => {
        if (current !== uri) setFailedFor(uri);
        else onError?.(e);
      }}
    />
  );
}
