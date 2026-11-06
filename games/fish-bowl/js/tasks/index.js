// Task MonoBehaviours by short class name (see components.js for the framework ones).
import { CleanMoss, CountCollectedItems } from './cleanmoss.js';
import { FeedFish } from './feedfish.js';
import { FishGetsFood } from './jumps.js';
import { FloppingFish } from './flopping.js';
import { PerformGestureTask, RecognizedEvents } from './gestures.js';

export const TASKS = { CleanMoss, CountCollectedItems, FeedFish, FishGetsFood, FloppingFish, PerformGestureTask, RecognizedEvents };
