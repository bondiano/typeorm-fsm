import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { StateMachineEntity, t, state } from '../..';

/**
 * First, user submits a file to the server.
 * We're uploading a file to S3 bucket and want to track its state.
 */

enum FileState {
  pending = 'pending',
  uploading = 'uploading',
  completed = 'completed',
  failed = 'failed',
}

enum FileEvent {
  start = 'start',
  finish = 'finish',
  fail = 'fail',
}

@Entity('file')
class File extends StateMachineEntity({
  status: state({
    id: 'fileStatus',
    initial: FileState.pending,
    transitions: [
      t(FileState.pending, FileEvent.start, FileState.uploading),
      t(FileState.uploading, FileEvent.finish, FileState.completed, {
        async guard(this: File, _context, url: string) {
          const hasTheSameUrl = (this.url !== url) as boolean;

          return hasTheSameUrl;
        },
        async onEnter(this: File, _context, url: string | null) {
          this.url = url;
        },
      }),
      t(
        [FileState.pending, FileState.uploading],
        FileEvent.fail,
        FileState.failed,
      ),
    ],
  }),
}) {
  @PrimaryGeneratedColumn()
  id: string;

  @Column({ nullable: true, type: 'varchar' })
  url: string | null;
}

describe('File upload', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource({
      name: (Date.now() * Math.random()).toString(16),
      database: ':memory:',
      dropSchema: true,
      entities: [File],
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
    await dataSource.manager.clear(File);
  });

  const findFileById = async (id: string) => {
    return await dataSource.manager.findOneOrFail(File, {
      where: {
        id,
      },
    });
  };

  it('should change state', async () => {
    const file = new File();
    await file.save();

    expect(file.fsm.status.isPending()).toBe(true);

    await file.fsm.status.start();
    expect(file.fsm.status.isUploading()).toBe(true);
    expect(await findFileById(file.id)).toContain({
      status: FileState.uploading,
    });

    await file.fsm.status.finish('https://example.com');
    expect(file.fsm.status.isCompleted()).toBe(true);
    expect(await findFileById(file.id)).toContain({
      status: FileState.completed,
      url: 'https://example.com',
    });
  });
});
