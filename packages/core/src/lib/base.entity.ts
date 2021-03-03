import { MonoTypeOperatorFunction, Observable, Subject } from 'rxjs';
import { map } from 'rxjs/operators';
import { BaseEvent, LockEvent } from './interfaces/event.interface';
import { createValueState, ValueState } from './state';
import {
  entityProperty as _entityProperty,
  ID,
  log as _log,
  LOG_LEVEL,
  UID,
  withLog as _withLog,
} from './utils/tool-kit.util';
import { HashMap } from './utils/types';
import { BaseEntityOptions, BaseEntityType } from './interfaces';

export class BaseEntity {
  protected _id: ID;
  protected destroyed$: Subject<void>;
  protected locked$: ValueState<boolean>;
  protected name$: ValueState<string>;
  protected displayName$: ValueState<string>;

  protected readonly _type: BaseEntityType;
  protected readonly _logPrefix: string;

  constructor(options: BaseEntityOptions) {
    this._id = options.id || UID();
    this._type = options.type;
    this._logPrefix = `${options.logPrefix ?? ''}`;
    this.destroyed$ = new Subject<void>();
    this.locked$ = createValueState<boolean>(!!options.locked, this.entityPipe('locked'));
    this.name$ = createValueState<string>(options.name ?? 'default', this.entityPipe('name'));
    this.displayName$ = createValueState<string>(options.displayName ?? '', this.entityPipe('displayName'));
  }

  get type(): BaseEntityType {
    return this._type;
  }

  get id(): ID {
    return this._id;
  }

  set id(id: ID) {
    this._id = id;
  }

  get name(): string {
    return this.name$.value;
  }

  set name(value: string) {
    this.name$.set(value).emit();
  }

  log(message: string, ...args: any): void {
    _log(`${this._logPrefix} ${message}: `, LOG_LEVEL.LOG, ...args);
  }

  withLog(message: string, ...args: any): any {
    return _withLog(`${this._logPrefix} ${message}: `, LOG_LEVEL.LOG, ...args);
  }

  entityPipe<T>(logMessage = ''): MonoTypeOperatorFunction<T> {
    return _entityProperty<T>(
      this.onEntityDestroy(),
      0,
      `${this._logPrefix}: ${logMessage}`
    );
  }

  getLocked(): boolean {
    return this.locked$.value;
  }

  setLocked(locked = true) {
    this.locked$.set(locked).emit();
  }

  // eslint-disable-next-line
  doClone(lookupTable: HashMap<any> = {}, clone: this) {
    /*noop*/
  }

  clone(lookupTable: HashMap<any> = {}) {
    // try and use an existing clone first
    if (lookupTable[this.id]) {
      return lookupTable[this.id];
    }
    const clone = { ...this };
    clone.id = UID();
    // clone.clearListeners();
    lookupTable[this.id] = clone;

    this.doClone(lookupTable, clone);
    return clone;
  }

  // serialize(): BaseModelOptions {
  //   return {
  //     id: this.id,
  //     locked: this.getLocked(),
  //   };
  // }

  lockChanges(): Observable<LockEvent> {
    return this.locked$.select((locked) => new LockEvent(this, locked));
  }

  destroy() {
    this.log('entity destroyed');
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  onEntityDestroy(): Observable<BaseEvent<BaseEntity>> {
    return this.destroyed$.pipe(map(() => new BaseEvent(this)));
  }
}
