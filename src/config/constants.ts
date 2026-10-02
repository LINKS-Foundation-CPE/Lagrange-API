import { Duration } from "luxon";

const MINIMUM_SLOT_DURATION = Duration.fromObject({ minutes: 30 });
const MINIMUM_RESERVATION_DURATION = Duration.fromObject({ minutes: 30 });

export { MINIMUM_SLOT_DURATION, MINIMUM_RESERVATION_DURATION };
