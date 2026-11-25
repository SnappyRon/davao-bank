/* eslint-disable @typescript-eslint/no-require-imports -- React Native static image assets */
import type { ImageSourcePropType } from 'react-native';

/**
 * Approved mascot illustrations (spec 7C, D1, D2, D6).
 * Keep decorative: always render with accessible={false}.
 */
export const MASCOT_EMPTY: ImageSourcePropType = require('../../assets/illustrations/duri-empty-state.png');
export const MASCOT_ERROR: ImageSourcePropType = require('../../assets/illustrations/duri-error-state.png');
export const MASCOT_NOT_FOUND: ImageSourcePropType = require('../../assets/illustrations/kada-not-found.png');
