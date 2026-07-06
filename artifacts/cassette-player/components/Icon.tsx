import React from "react";
import Svg, { Path, Circle, G } from "react-native-svg";

type IconName =
  | "skip-back" | "skip-forward" | "rewind" | "fast-forward"
  | "play" | "pause" | "arrow-left" | "list" | "refresh-cw"
  | "plus" | "x" | "volume-2" | "music" | "folder" | "folder-open"
  | "trash-2" | "search" | "info" | "check"
  | "link" | "youtube" | "share-2" | "download" | "edit-3" | "cassette";

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 24, color = "#fff", strokeWidth = 2 }: IconProps) {
  const sw = strokeWidth;
  const props = { stroke: color, strokeWidth: sw, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  const renderPaths = () => {
    switch (name) {
      case "play":
        return <Path d="M5 3l14 9-14 9V3z" stroke={color} strokeWidth={sw} fill={color} strokeLinecap="round" strokeLinejoin="round" />;
      case "pause":
        return (
          <G>
            <Path d="M6 4h4v16H6z" stroke={color} strokeWidth={sw} fill={color} strokeLinecap="round" strokeLinejoin="round" />
            <Path d="M14 4h4v16h-4z" stroke={color} strokeWidth={sw} fill={color} strokeLinecap="round" strokeLinejoin="round" />
          </G>
        );
      case "skip-back":
        return (
          <G {...props}>
            <Path d="M19 20L9 12l10-8v16z" fill={color} />
            <Path d="M5 4v16" />
          </G>
        );
      case "skip-forward":
        return (
          <G {...props}>
            <Path d="M5 4l10 8-10 8V4z" fill={color} />
            <Path d="M19 4v16" />
          </G>
        );
      case "rewind":
        return (
          <G {...props}>
            <Path d="M11 19l-9-7 9-7v14z" fill={color} />
            <Path d="M22 19l-9-7 9-7v14z" fill={color} />
          </G>
        );
      case "fast-forward":
        return (
          <G {...props}>
            <Path d="M13 19l9-7-9-7v14z" fill={color} />
            <Path d="M2 19l9-7-9-7v14z" fill={color} />
          </G>
        );
      case "arrow-left":
        return (
          <G {...props}>
            <Path d="M19 12H5" />
            <Path d="M12 5l-7 7 7 7" />
          </G>
        );
      case "list":
        return (
          <G {...props}>
            <Path d="M8 6h13M8 12h13M8 18h13" />
            <Path d="M3 6h.01M3 12h.01M3 18h.01" strokeWidth={sw * 2.5} strokeLinecap="round" />
          </G>
        );
      case "refresh-cw":
        return (
          <G {...props}>
            <Path d="M23 4v6h-6" />
            <Path d="M1 20v-6h6" />
            <Path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
          </G>
        );
      case "plus":
        return (
          <G {...props}>
            <Path d="M12 5v14M5 12h14" />
          </G>
        );
      case "x":
        return (
          <G {...props}>
            <Path d="M18 6L6 18M6 6l12 12" />
          </G>
        );
      case "volume-2":
        return (
          <G {...props}>
            <Path d="M11 5L6 9H2v6h4l5 4V5z" fill={color} fillOpacity={0.3} />
            <Path d="M15.54 8.46a5 5 0 010 7.07" />
            <Path d="M19.07 4.93a10 10 0 010 14.14" />
          </G>
        );
      case "music":
        return (
          <G {...props}>
            <Path d="M9 18V5l12-2v13" />
            <Circle cx={6} cy={18} r={3} />
            <Circle cx={18} cy={16} r={3} />
          </G>
        );
      case "folder":
        return (
          <G {...props}>
            <Path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
          </G>
        );
      case "folder-open":
        return (
          <G {...props}>
            <Path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
            <Path d="M2 10h20" />
          </G>
        );
      case "trash-2":
        return (
          <G {...props}>
            <Path d="M3 6h18" />
            <Path d="M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2" />
            <Path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" />
            <Path d="M10 11v6M14 11v6" />
          </G>
        );
      case "search":
        return (
          <G {...props}>
            <Circle cx={11} cy={11} r={7} />
            <Path d="M21 21l-4.35-4.35" />
          </G>
        );
      case "info":
        return (
          <G {...props}>
            <Circle cx={12} cy={12} r={10} />
            <Path d="M12 16v-4M12 8h.01" strokeWidth={sw * 1.5} />
          </G>
        );
      case "check":
        return (
          <G {...props}>
            <Path d="M20 6L9 17l-5-5" />
          </G>
        );
      case "link":
        return (
          <G {...props}>
            <Path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
            <Path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
          </G>
        );
      case "youtube":
        return (
          <G {...props}>
            <Path d="M22.54 6.42a2.78 2.78 0 00-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46A2.78 2.78 0 001.46 6.42 29 29 0 001 12a29 29 0 00.46 5.58 2.78 2.78 0 001.95 1.96C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 001.95-1.96A29 29 0 0023 12a29 29 0 00-.46-5.58z" strokeWidth={sw} />
            <Path d="M9.75 15.02l5.75-3.02-5.75-3.02v6.04z" fill={color} stroke={color} strokeWidth={sw * 0.5} />
          </G>
        );
      case "share-2":
        return (
          <G {...props}>
            <Circle cx={18} cy={5} r={3} />
            <Circle cx={6} cy={12} r={3} />
            <Circle cx={18} cy={19} r={3} />
            <Path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" />
          </G>
        );
      case "download":
        return (
          <G {...props}>
            <Path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <Path d="M7 10l5 5 5-5" />
            <Path d="M12 15V3" />
          </G>
        );
      case "edit-3":
        return (
          <G {...props}>
            <Path d="M12 20h9" />
            <Path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
          </G>
        );
      case "cassette":
        return (
          <G {...props}>
            <Path d="M2 6a2 2 0 012-2h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
            <Circle cx={8} cy={11} r={2} />
            <Circle cx={16} cy={11} r={2} />
            <Path d="M10 11h4" />
            <Path d="M7 20l1.5-3h7L17 20" />
          </G>
        );
      default:
        return null;
    }
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {renderPaths()}
    </Svg>
  );
}
