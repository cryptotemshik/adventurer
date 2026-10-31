/** Every image the generator renders, relative to the repo root. */
export interface Output {
  id: string;
  file: string;
  width: number;
  height: number;
}

const tweet = (n: number): Output => {
  const id = `tweet-${String(n).padStart(2, "0")}`;
  return { id, file: `twitter/images/${id}.png`, width: 1600, height: 900 };
};

export const OUTPUTS: Output[] = [
  ...Array.from({ length: 9 }, (_, i) => tweet(i + 1)),
  { id: "banner", file: "twitter/images/banner.png", width: 1500, height: 500 },
  { id: "avatar", file: "twitter/images/avatar.png", width: 500, height: 500 },
  { id: "coin", file: "launch/coin-1000.png", width: 1000, height: 1000 },
];
