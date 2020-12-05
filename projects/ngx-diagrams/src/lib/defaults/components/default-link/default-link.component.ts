import { Component, AfterViewInit, ChangeDetectorRef, ViewChild, ViewContainerRef, OnInit } from '@angular/core';
import { DefaultLinkModel } from '../../models/default-link.model';
import { generateCurvePath, generateDynamicPath } from '../../../utils/tool-kit.util';
import { combineLatest, BehaviorSubject, Observable } from 'rxjs';
import { PointModel } from '../../../models/point.model';
import { LabelModel } from '../../../models/label.model';
import { filter, takeUntil } from 'rxjs/operators';
import { Coords } from '../../../interfaces';
import { PathFinding } from '../../../plugins/smart-routing.plugin';

@Component({
	selector: 'ngdx-default-link',
	templateUrl: './default-link.component.html',
	styleUrls: ['./default-link.component.scss'],
})
export class DefaultLinkComponent extends DefaultLinkModel implements AfterViewInit, OnInit {
	@ViewChild('labelLayer', { read: ViewContainerRef, static: true }) labelLayer: ViewContainerRef;

	_path$: BehaviorSubject<string> = new BehaviorSubject(null);
	path$: Observable<string> = this._path$.pipe(this.entityPipe('path'));
	points$: BehaviorSubject<PointModel[]> = new BehaviorSubject([]);
	label$: Observable<LabelModel>;
	pathFinding: PathFinding; // only set when smart routing is active

	constructor(private cdRef: ChangeDetectorRef) {
		super({ type: 'ngdx-default-link' });
	}

	trackByPoints(i: number, point: PointModel) {
		return point.id;
	}

	ngOnInit() {
		if (this.diagramEngine.getSmartRouting()) {
			this.pathFinding = this.diagramEngine.getPathfinding();
		}
	}

	ngAfterViewInit() {
		const firstPCoords$ = this.getFirstPoint().selectCoords();
		const lastPCoords$ = this.getLastPoint().selectCoords();

		// Observe link coords and update drawing accordingly
		combineLatest([firstPCoords$, lastPCoords$])
			.pipe(takeUntil(this.onEntityDestroy()))
			.subscribe(async ([firstPCoords, lastPCoords]) => {
				const points = [firstPCoords, lastPCoords];

				if (this.diagramEngine.getSmartRouting()) {
					const path = await this.pathFinding.calculatePath(firstPCoords, lastPCoords);

					const smartPath = generateDynamicPath(path);
					this._path$.next(smartPath);
				} else {
					// handle regular links
					// draw the smoothing
					// if the points are too close, just draw a straight line
					const isHorizontal = Math.abs(firstPCoords.x - lastPCoords.x) > Math.abs(firstPCoords.y - lastPCoords.y);
					const xOrY = isHorizontal ? 'x' : 'y';
					let isStraight = false;
					if (Math.abs(points[0][xOrY] - points[1][xOrY]) < 50) {
						isStraight = true;
					}

					const path = generateCurvePath(firstPCoords, lastPCoords, isStraight ? 0 : this.curvyness);
					this._path$.next(path);
				}

				const label = this.getLabel();
				// update label position
				if (label) {
					label.setCoords(this.calcCenterOfPath(firstPCoords, lastPCoords));

					// TODO: check whether we want the label to rotate along with the line
					// label.setRotation(this.calcLabelIncline(firstPCoords, lastPCoords));
				}

				// TODO: handle the multiple lines in between the points
				// https://github.com/projectstorm/react-diagrams/blob/master/src/defaults/widgets/DefaultLinkWidget.tsx#L344-L371

				this.cdRef.detectChanges();
			});

		// observe link label and draw/remove accordingly
		this.selectLabel()
			.pipe(filter(Boolean))
			.subscribe((label: LabelModel) => {
				this.diagramEngine.generateWidgetForLabel(label, this.labelLayer);
				this.cdRef.detectChanges();
			});
	}

	calcLabelIncline(firstPoint: Coords, secondPoint: Coords): number {
		const dy = secondPoint.y - firstPoint.y;
		const dx = secondPoint.x - firstPoint.x;

		if (dx === 0) {
			return 0;
		}

		let inclineAngel = (Math.atan(dy / dx) * 180) / Math.PI;

		if (inclineAngel < 0) {
			inclineAngel += 180;
		}

		return inclineAngel;
	}

	calcCenterOfPath(firstPoint: Coords, secondPoint: Coords): Coords {
		return { x: (firstPoint.x + secondPoint.x) / 2 + 20, y: (firstPoint.y + secondPoint.y) / 2 + 20 };
	}
}
