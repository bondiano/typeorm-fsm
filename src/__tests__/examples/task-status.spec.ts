import { FsmContext } from 'fsmoothy/types';
import {
  Entity,
  PrimaryGeneratedColumn,
  BaseEntity,
  Column,
  DataSource,
  OneToMany,
  JoinColumn,
  ManyToOne,
  QueryRunner,
} from 'typeorm';
import { describe, it, expect, afterAll, afterEach, beforeAll } from 'vitest';

import { StateMachineEntity, state, t } from '../..';

const fakeDate = new Date('2020-01-01');

const enum TaskState {
  Inactive = 'inactive',
  Active = 'active',
  Completed = 'completed',
}

const enum TaskEvent {
  Activate = 'activate',
  Complete = 'complete',
}

interface ITask {
  id: number;
  title: string;
  tags: Array<ITag>;
  completedAt?: Date;
}

interface ITag {
  id: number;
  name: string;
}

interface ITaskContext extends FsmContext<never> {
  qr: QueryRunner;
}

const activate = t<TaskState, TaskEvent, ITaskContext>(
  TaskState.Inactive,
  TaskEvent.Activate,
  TaskState.Active,
  {
    async onEnter(this: ITask, context, tags: Array<ITag>) {
      this.tags = await Promise.all(
        tags.map(async (tag) => {
          const newTag = context.qr.manager.create(Tag, tag);
          return await context.qr.manager.save(Tag, newTag);
        }),
      );
    },
    async onExit(this: ITask, context) {
      await context.qr.manager.save(Task, this);
    },
  },
);

const complete = t<TaskState, TaskEvent, ITaskContext>(
  TaskState.Active,
  TaskEvent.Complete,
  TaskState.Completed,
  {
    onEnter(this: ITask) {
      this.completedAt = fakeDate;
    },
    async onExit(this: ITask, context) {
      for (const tag of this.tags) {
        tag.name = tag.name.toUpperCase() + '-completed';
        await context.qr.manager.save(Tag, tag);
      }

      await context.qr.manager.save(Task, this);
    },
  },
);

@Entity()
class Task
  extends StateMachineEntity({
    status: state<TaskState, TaskEvent, ITaskContext>({
      initial: TaskState.Inactive,
      saveAfterTransition: false,
      transitions: [activate, complete],
    }),
  })
  implements ITask
{
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @OneToMany(() => Tag, (tag) => tag.task, {
    eager: true,
  })
  @JoinColumn({ name: 'tag_id' })
  tags: Array<Tag>;

  @Column({ nullable: true })
  completedAt?: Date;
}

@Entity()
class Tag extends BaseEntity implements ITag {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @ManyToOne(() => Task, (task) => task.id)
  task: Task;
}

describe('Task Status', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource({
      name: (Date.now() * Math.random()).toString(16),
      database: ':memory:',
      dropSchema: true,
      entities: [Tag, Task],
      logging: ['error', 'warn'],
      synchronize: true,
      type: 'better-sqlite3',
    });

    await dataSource.initialize();
    await dataSource.synchronize();
  });

  afterAll(async () => {
    await dataSource.dropDatabase();
    await dataSource.destroy();
  });

  afterEach(async () => {
    await dataSource.manager.clear(Tag);
    await dataSource.manager.clear(Task);
  });

  it('should be able to pass user flow', async () => {
    const task = new Task();
    task.title = 'My Task';
    await task.save();

    const queryRunner = dataSource.createQueryRunner();
    task.fsm.status.inject('qr', queryRunner);

    await queryRunner.startTransaction();
    await task.fsm.status.activate([
      {
        name: 'Tag One',
      },
      {
        name: 'Tag Two',
      },
    ]);

    expect(task.status).toBe(TaskState.Active);

    await task.fsm.status.complete();
    await queryRunner.commitTransaction();

    const taskFromDatabase = await dataSource.manager.findOneByOrFail(Task, {
      id: task.id,
    });
    expect(taskFromDatabase.status).toBe(TaskState.Completed);
    expect(taskFromDatabase.tags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'TAG ONE-completed',
        }),
        expect.objectContaining({
          name: 'TAG TWO-completed',
        }),
      ]),
    );
  });
});
