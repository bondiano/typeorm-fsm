import { StateMachine, t, IStateMachine } from '../..';

enum ClockState {
  Clock = 'clock',
  Bell = 'bell',
  Alarm = 'alarm',
}

enum ClockEvent {
  Tick = 'tick',
  ClickH = 'clickH',
  ClickM = 'clickM',
  ClickMode = 'clickMode',
  LongClickMode = 'longClickMode',
  ActivateAlarm = 'activateAlarm',
}

interface IClockContext {
  time: {
    minutes: number;
    hours: number;
  };
  alarm: {
    minutes: number;
    hours: number;
  };
  isAlarmOn: boolean;
}

type Clock = IStateMachine<ClockState, ClockEvent, IClockContext>;

const addMinutes = (type: 'time' | 'alarm') => (context: IClockContext) => {
  context[type].minutes = (context[type].minutes + 1) % 60;
};

const addHours = (type: 'time' | 'alarm') => (context: IClockContext) => {
  context[type].hours = (context[type].hours + 1) % 24;
};

const createAlarmClock = (): Clock => {
  const clockState = new StateMachine({
    initial: ClockState.Clock,
    ctx: {
      time: {
        minutes: 0,
        hours: 12,
      },
      alarm: {
        minutes: 0,
        hours: 6,
      },
      isAlarmOn: false as boolean,
    },
    transitions: [
      t(ClockState.Clock, ClockEvent.ClickMode, ClockState.Alarm),
      t(ClockState.Alarm, ClockEvent.ClickMode, ClockState.Clock),
      t(ClockState.Bell, ClockEvent.ClickMode, ClockState.Clock),
      t(ClockState.Bell, ClockEvent.ClickH, ClockState.Bell),
      t(ClockState.Bell, ClockEvent.ClickM, ClockState.Bell),
      t(ClockState.Bell, ClockEvent.ClickMode, ClockState.Bell),
      t(ClockState.Bell, ClockEvent.Tick, ClockState.Bell),
      t(ClockState.Bell, ClockEvent.LongClickMode, ClockState.Clock),
      t(ClockState.Clock, ClockEvent.Tick, ClockState.Clock),
      t(ClockState.Alarm, ClockEvent.Tick, ClockState.Alarm),
      t(
        [ClockState.Clock, ClockState.Alarm],
        ClockEvent.ActivateAlarm,
        ClockState.Bell,
        (context: IClockContext) =>
          context.isAlarmOn &&
          context.time.hours === context.alarm.hours &&
          context.time.minutes === context.alarm.minutes,
      ),
      {
        from: ClockState.Clock,
        event: ClockEvent.ClickH,
        to: ClockState.Clock,
        onEnter: addHours('time'),
      },
      {
        from: ClockState.Clock,
        event: ClockEvent.ClickM,
        to: ClockState.Clock,
        onEnter: addMinutes('time'),
      },
      {
        from: ClockState.Alarm,
        event: ClockEvent.ClickH,
        to: ClockState.Alarm,
        onEnter: addHours('alarm'),
      },
      {
        from: ClockState.Alarm,
        event: ClockEvent.ClickM,
        to: ClockState.Alarm,
        onEnter: addMinutes('alarm'),
      },
      {
        from: ClockState.Clock,
        event: ClockEvent.LongClickMode,
        to: ClockState.Clock,
        onEnter(context) {
          context.isAlarmOn = !context.isAlarmOn;
        },
      },
    ],
  });

  clockState.on(ClockEvent.Tick, async function (context, minutes: number = 1) {
    context.time.minutes = (context.time.minutes + minutes) % 60;
    context.time.hours =
      context.time.minutes === 0
        ? (context.time.hours + 1) % 24
        : context.time.hours;
  });

  clockState.on(ClockEvent.Tick, async function (this: Clock) {
    if (await this.canActivateAlarm()) {
      await this.activateAlarm();
    }
  });

  return clockState;
};

describe('Alarm clock', () => {
  it('should have default values', () => {
    const clock = createAlarmClock();

    expect(clock.context.time.hours).toBe(12);
    expect(clock.context.time.minutes).toBe(0);
    expect(clock.context.alarm.hours).toBe(6);
    expect(clock.context.alarm.minutes).toBe(0);
  });

  it('should change state when click to mode', async () => {
    const clock = createAlarmClock();
    expect(clock.context.isAlarmOn).toBe(false);
    expect(clock.current).toBe(ClockState.Clock);

    await clock.clickMode();
    expect(clock.context.isAlarmOn).toBe(false);
    expect(clock.current).toBe(ClockState.Alarm);

    await clock.clickMode();
    expect(clock.context.isAlarmOn).toBe(false);
    expect(clock.current).toBe(ClockState.Clock);

    await clock.longClickMode();
    expect(clock.context.isAlarmOn).toBe(true);
    expect(clock.current).toBe(ClockState.Clock);

    await clock.clickMode();
    expect(clock.context.isAlarmOn).toBe(true);
    expect(clock.current).toBe(ClockState.Alarm);

    await clock.clickMode();
    expect(clock.context.isAlarmOn).toBe(true);
    expect(clock.current).toBe(ClockState.Clock);

    await clock.longClickMode();
    expect(clock.context.isAlarmOn).toBe(false);
    expect(clock.current).toBe(ClockState.Clock);
  });

  it('should change hours and minutes', async () => {
    const clock = createAlarmClock();

    await clock.clickH();
    expect(clock.context.time.hours).toBe(13);
    expect(clock.context.time.minutes).toBe(0);
    expect(clock.context.alarm.hours).toBe(6);
    expect(clock.context.alarm.minutes).toBe(0);

    await clock.clickM();
    expect(clock.context.time.hours).toBe(13);
    expect(clock.context.time.minutes).toBe(1);
    expect(clock.context.alarm.hours).toBe(6);
    expect(clock.context.alarm.minutes).toBe(0);

    await clock.clickMode();

    await clock.clickH();

    expect(clock.context.time.hours).toBe(13);
    expect(clock.context.time.minutes).toBe(1);
    expect(clock.context.alarm.hours).toBe(7);
    expect(clock.context.alarm.minutes).toBe(0);

    await clock.clickM();
    expect(clock.context.time.hours).toBe(13);
    expect(clock.context.time.minutes).toBe(1);
    expect(clock.context.alarm.hours).toBe(7);
    expect(clock.context.alarm.minutes).toBe(1);

    for (let index = 0; index < 60; index += 1) {
      await clock.clickM();
    }
    expect(clock.context.alarm.minutes).toBe(1);
    expect(clock.context.alarm.hours).toBe(7);

    for (let index = 0; index < 17; index += 1) {
      await clock.clickH();
    }
    expect(clock.context.alarm.hours).toBe(0);
  });

  it('should not start bell if alarm off', async () => {
    const clock = createAlarmClock();

    for (let index = 0; index < 18 * 60; index += 1) {
      await clock.tick();
    }

    expect(await clock.canActivateAlarm()).toBe(false);
    expect(clock.current).toBe(ClockState.Clock);
    await clock.clickM();
    await clock.clickH();

    await clock.tick();
    expect(clock.current).toBe(ClockState.Clock);
  });

  it('should start bell if alarm on', async () => {
    const clock = createAlarmClock();

    await clock.longClickMode();

    for (let index = 0; index < 18 * 60; index += 1) {
      await clock.tick();
    }

    expect(clock.current).toBe(ClockState.Bell);

    await clock.clickM();
    await clock.clickH();
    await clock.tick();

    await clock.longClickMode();

    expect(clock.current).toBe(ClockState.Clock);
  });

  it('should start bell if state is Alarm', async () => {
    const clock = createAlarmClock();
    await clock.longClickMode();
    await clock.clickMode();
    expect(clock.current).toBe(ClockState.Alarm);

    for (let index = 0; index < 18 * 60; index += 1) {
      await clock.tick();
    }

    expect(clock.current).toBe(ClockState.Bell);

    await clock.clickMode();
    expect(clock.current).toBe(ClockState.Bell);
  });

  it('should increment minutes after Alarm', async () => {
    const clock = createAlarmClock();
    await clock.longClickMode();

    for (let index = 0; index < 18 * 60; index += 1) {
      await clock.tick();
    }

    expect(clock.current).toBe(ClockState.Bell);

    await clock.tick();
    await clock.longClickMode();

    expect(clock.current).toBe(ClockState.Clock);
    expect(clock.context.time.minutes).toBe(1);
  });
});
