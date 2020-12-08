import { BehaviorSubject, Observable } from 'rxjs';
import { LinkModel } from '../../models/link.model';

export class DefaultLinkModel extends LinkModel {
	protected _width$ = new BehaviorSubject(3);
	protected _color$ = new BehaviorSubject('rgba(255,255,255,0.5)');
	protected _curvyness$ = new BehaviorSubject(50);

	width$ = this._width$.pipe(this.entityPipe('width'));
	color$ = this._color$.pipe(this.entityPipe('color'));
	curvyness$ = this._curvyness$.pipe(this.entityPipe('curvyness'));

	constructor({ type = 'default', id, logPrefix = '[DefaultLink]' }: { type?: string; id?: string; logPrefix?: string } = {}) {
		super(type, id, logPrefix);
	}

	setWidth(width: number) {
		this._width$.next(width);
	}

	setColor(color: string) {
		this._color$.next(color);
	}

	selectWidth(): Observable<number> {
		return this.width$;
	}

	selectColor(): Observable<string> {
		return this.color$;
	}

	setCurvyness(curvyness: number) {
		this._curvyness$.next(curvyness);
	}

	get color() {
		return this._color$.getValue();
	}

	get width() {
		return this._width$.getValue();
	}

	get curvyness() {
		return this._curvyness$.getValue();
	}
}
