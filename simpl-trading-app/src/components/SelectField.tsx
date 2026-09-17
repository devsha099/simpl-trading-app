import { SheetSelect, type SheetOption } from "./SheetSelect";

type Props = {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: readonly SheetOption[];
  placeholder?: string;
  error?: string;
  /** Sheet heading and one line of framing, when the field label isn't enough. */
  title?: string;
  subtitle?: string;
};

/**
 * Form dropdown. Now a thin wrapper over SheetSelect — the prop signature is
 * unchanged from the `<Picker>` version on purpose, so all ten existing call
 * sites (onboarding, investment profile, banking, trade) got the new sheet
 * without being touched, and each can add per-option `description` text when
 * it has something worth saying.
 */
export function SelectField({ label, title, subtitle, ...rest }: Props) {
  return <SheetSelect label={label} title={title ?? label} subtitle={subtitle} {...rest} />;
}
