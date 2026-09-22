import React from "react";
import { Composition, registerRoot } from "remotion";
import { ShortsVideo, type VideoProps } from "./Video";
const Root = () => (
  <Composition
    id="PaperShort"
    component={ShortsVideo}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={450}
    defaultProps={{} as VideoProps}
    calculateMetadata={({ props }: { props: VideoProps }) => ({
      durationInFrames: props.board.durationSec * 30,
    })}
  />
);
registerRoot(Root);
