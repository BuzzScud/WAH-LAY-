/**
 * A dish's picture: the owner's real photo when one exists, the illustration
 * otherwise. Every place that shows a dish goes through here, so uploading a
 * photo swaps it in everywhere at once.
 */
import DishArt, { DishThumb, type ArtKind } from './DishArt';

interface Props {
  kind: ArtKind;
  photo?: string | null;
  /** Dish name — becomes the alt text on a real photo. */
  name: string;
  className?: string;
  /** Above-the-fold pictures skip lazy loading. */
  eager?: boolean;
  /** `thumb` points at the page sprite; `full` inlines its own gradients. */
  variant?: 'full' | 'thumb';
  /** CSS filter from `artTint()`; ignored for real photos. */
  tint?: string;
}

export default function DishMedia({ kind, photo, name, className, eager, variant = 'full', tint }: Props) {
  if (photo) {
    return (
      <img
        src={photo}
        alt={name}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        className={className}
      />
    );
  }
  return variant === 'thumb' ? (
    <DishThumb kind={kind} className={className} tint={tint} />
  ) : (
    <DishArt kind={kind} className={className} tint={tint} />
  );
}
