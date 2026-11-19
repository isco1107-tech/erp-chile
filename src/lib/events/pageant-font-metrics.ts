// Generado por scripts/measure-pageant-fonts.ts: no editar a mano.
import type { PageantFontKey } from './pageant-typography';

/**
 * Métricas reales (en `em`) de cada fuente que puede elegir el micrositio:
 * altura de la x y ancho promedio por carácter de un texto en español, de
 * uno en mayúsculas y de cifras, en regular y en negrita.
 */
export interface PageantWidths {
  text: number;
  caps: number;
  digits: number;
}

export interface PageantFontMetric extends PageantWidths {
  xHeight: number;
  /** Anchos en negrita (700); una familia sin negrita repite los regulares. */
  bold: PageantWidths;
}

export const PAGEANT_FONT_METRICS: Record<PageantFontKey, PageantFontMetric> = {
  italiana: { xHeight: 0.5, text: 0.4308, caps: 0.4817, digits: 0.4568, bold: { text: 0.4308, caps: 0.4817, digits: 0.4568 } },
  cormorant: { xHeight: 0.386, text: 0.3902, caps: 0.5136, digits: 0.3976, bold: { text: 0.3947, caps: 0.5226, digits: 0.3993 } },
  karla: { xHeight: 0.478, text: 0.4587, caps: 0.4815, digits: 0.504, bold: { text: 0.4811, caps: 0.5109, digits: 0.5353 } },
  sans: { xHeight: 0.5283, text: 0.4516, caps: 0.5542, digits: 0.5098, bold: { text: 0.483, caps: 0.5621, digits: 0.5116 } },
  serif: { xHeight: 0.459, text: 0.4046, caps: 0.5406, digits: 0.4593, bold: { text: 0.4329, caps: 0.5648, digits: 0.4611 } },
  display: { xHeight: 0.4814, text: 0.4447, caps: 0.5456, digits: 0.5131, bold: { text: 0.5199, caps: 0.6112, digits: 0.5804 } },
  inter: { xHeight: 0.5459, text: 0.4787, caps: 0.5493, digits: 0.5496, bold: { text: 0.4949, caps: 0.5575, digits: 0.5735 } },
  poppins: { xHeight: 0.548, text: 0.506, caps: 0.5143, digits: 0.5317, bold: { text: 0.522, caps: 0.5383, digits: 0.5465 } },
  montserrat: { xHeight: 0.525, text: 0.5032, caps: 0.5666, digits: 0.5363, bold: { text: 0.5297, caps: 0.5876, digits: 0.5617 } },
  nunito: { xHeight: 0.484, text: 0.4497, caps: 0.5336, digits: 0.541, bold: { text: 0.4674, caps: 0.5493, digits: 0.5436 } },
  raleway: { xHeight: 0.519, text: 0.4652, caps: 0.5282, digits: 0.5052, bold: { text: 0.4834, caps: 0.5317, digits: 0.5234 } },
  'space-grotesk': { xHeight: 0.486, text: 0.4877, caps: 0.499, digits: 0.5435, bold: { text: 0.4898, caps: 0.5034, digits: 0.5492 } },
  josefin: { xHeight: 0.378, text: 0.4555, caps: 0.5579, digits: 0.4953, bold: { text: 0.4839, caps: 0.5694, digits: 0.5069 } },
  oswald: { xHeight: 0.578, text: 0.3624, caps: 0.4024, digits: 0.4372, bold: { text: 0.4125, caps: 0.4482, digits: 0.4706 } },
  playfair: { xHeight: 0.514, text: 0.4521, caps: 0.5227, digits: 0.4611, bold: { text: 0.4641, caps: 0.5476, digits: 0.4949 } },
  lora: { xHeight: 0.5, text: 0.4665, caps: 0.5376, digits: 0.5027, bold: { text: 0.4807, caps: 0.5549, digits: 0.5106 } },
  'dm-serif': { xHeight: 0.481, text: 0.4495, caps: 0.4928, digits: 0.4638, bold: { text: 0.4495, caps: 0.4928, digits: 0.4638 } },
  'dm-sans': { xHeight: 0.504, text: 0.4659, caps: 0.5099, digits: 0.5379, bold: { text: 0.4947, caps: 0.5321, digits: 0.5534 } },
  manrope: { xHeight: 0.54, text: 0.4619, caps: 0.4999, digits: 0.5152, bold: { text: 0.4874, caps: 0.5264, digits: 0.5433 } },
  outfit: { xHeight: 0.475, text: 0.4488, caps: 0.5078, digits: 0.5115, bold: { text: 0.4641, caps: 0.5256, digits: 0.5234 } },
  jakarta: { xHeight: 0.536, text: 0.471, caps: 0.5256, digits: 0.5555, bold: { text: 0.487, caps: 0.5454, digits: 0.5615 } },
  'work-sans': { xHeight: 0.5, text: 0.4988, caps: 0.5493, digits: 0.5412, bold: { text: 0.5022, caps: 0.5527, digits: 0.5524 } },
  rubik: { xHeight: 0.52, text: 0.4689, caps: 0.5236, digits: 0.5363, bold: { text: 0.5015, caps: 0.5474, digits: 0.5802 } },
  figtree: { xHeight: 0.5, text: 0.4465, caps: 0.5285, digits: 0.5214, bold: { text: 0.4617, caps: 0.5366, digits: 0.532 } },
  quicksand: { xHeight: 0.503, text: 0.4684, caps: 0.5131, digits: 0.4916, bold: { text: 0.4929, caps: 0.522, digits: 0.5161 } },
  merriweather: { xHeight: 0.5555, text: 0.481, caps: 0.5429, digits: 0.5404, bold: { text: 0.4964, caps: 0.5571, digits: 0.5501 } },
  'libre-baskerville': { xHeight: 0.53, text: 0.5141, caps: 0.6352, digits: 0.5654, bold: { text: 0.5277, caps: 0.651, digits: 0.5904 } },
  'eb-garamond': { xHeight: 0.4, text: 0.379, caps: 0.5222, digits: 0.4346, bold: { text: 0.4174, caps: 0.5471, digits: 0.4799 } },
  fraunces: { xHeight: 0.482, text: 0.4693, caps: 0.5585, digits: 0.5276, bold: { text: 0.5017, caps: 0.5862, digits: 0.5724 } },
  bebas: { xHeight: 0.7, text: 0.3402, caps: 0.3194, digits: 0.3619, bold: { text: 0.3402, caps: 0.3194, digits: 0.3619 } },
  syne: { xHeight: 0.5, text: 0.4431, caps: 0.5047, digits: 0.4551, bold: { text: 0.554, caps: 0.6314, digits: 0.592 } },
  unbounded: { xHeight: 0.566, text: 0.6028, caps: 0.6665, digits: 0.7086, bold: { text: 0.6368, caps: 0.6946, digits: 0.7423 } },
  'instrument-serif': { xHeight: 0.51, text: 0.3395, caps: 0.3794, digits: 0.3662, bold: { text: 0.3395, caps: 0.3794, digits: 0.3662 } },
  anton: { xHeight: 0.7324, text: 0.4084, caps: 0.3927, digits: 0.4389, bold: { text: 0.4084, caps: 0.3927, digits: 0.4389 } },
  cinzel: { xHeight: 0.5, text: 0.548, caps: 0.544, digits: 0.485, bold: { text: 0.5585, caps: 0.5805, digits: 0.5362 } },
  abril: { xHeight: 0.476, text: 0.4627, caps: 0.533, digits: 0.5247, bold: { text: 0.4627, caps: 0.533, digits: 0.5247 } },
  caveat: { xHeight: 0.4, text: 0.3385, caps: 0.4333, digits: 0.4124, bold: { text: 0.344, caps: 0.4391, digits: 0.4122 } },
  dancing: { xHeight: 0.332, text: 0.3577, caps: 0.4897, digits: 0.4892, bold: { text: 0.3672, caps: 0.5205, digits: 0.5182 } },
};

/** Cormorant Garamond en cursiva real (frase principal, palabras destacadas): más angosta que la recta. */
export const CORMORANT_ITALIC_METRIC: PageantFontMetric = { xHeight: 0.386, text: 0.3572, caps: 0.4647, digits: 0.3645, bold: { text: 0.3572, caps: 0.4647, digits: 0.3645 } };
