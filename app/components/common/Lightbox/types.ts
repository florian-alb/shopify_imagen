export type LightboxImage = {
  url: string;
  label?: string;
};

export type LightboxState = {
  images: LightboxImage[];
  index: number;
} | null;

export type UseLightboxResult = {
  state: LightboxState;
  open: (images: LightboxImage[], index?: number) => void;
  close: () => void;
  setIndex: (index: number) => void;
  move: (delta: number) => void;
};
