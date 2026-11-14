import SplitText, { type SplitTextProps } from './SplitText/SplitText';

export function BlurText(props: SplitTextProps) {
  return <SplitText {...props} effect="blur" />;
}
