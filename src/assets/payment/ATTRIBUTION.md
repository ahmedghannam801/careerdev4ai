# Payment brand assets — sources and licences

These are the marks of the payment rails CareerDev4AI accepts. They are used
to tell the customer which company will receive their money; nothing else.

## Vodafone Cash — `vodafone.svg`

- Source: [Simple Icons](https://simpleicons.org/?q=vodafone) — `vodafone.svg`
- Licence: [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) (public domain dedication)
- Rendered colour: Vodafone brand red `#E60000`

## Stripe — `stripe.svg`

- Source: [Simple Icons](https://simpleicons.org/?q=stripe) — `stripe.svg`
- Licence: [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/)
- Rendered colour: Stripe blurple `#635BFF`

## Visa — `visa.svg`

- Source: [Simple Icons](https://simpleicons.org/?q=visa) — `visa.svg`
- Licence: [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/)
- Rendered colour: Visa navy `#1A1F71`

## Mastercard — `mastercard.svg`

- Source: [Simple Icons](https://simpleicons.org/?q=mastercard) — `mastercard.svg`
- Licence: [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/)
- Rendered colour: Mastercard red `#EB001B`

## InstaPay — `instapay-logo.png`

- Source: the official mark published by InstaPay on its own site,
  <https://www.instapay.eg/wp-content/uploads/2022/03/logo.png>
- Licence: InstaPay's own brand asset, used here nominatively to identify the
  payment method the customer can transfer to.
- Processing: trimmed to the wordmark's bounds and resized to 495×64 with a
  palette-quantised PNG (13 KB) so it stays sharp on a high-density screen
  without adding weight to the checkout bundle.

## How these are used

`src/components/payment/PaymentBrandMarks.tsx` renders them. The path data
in that file is copied verbatim from the SVG files above, and
`tests/payment-brand-marks.test.ts` asserts that it still matches, so a mark
cannot quietly drift into something that only resembles the brand.

The marks are decorative in the interface: they always sit beside the name of
the method, so assistive technology reads the name, not the picture.
