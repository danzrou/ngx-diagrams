import {
	Component,
	OnInit,
	Input,
	Renderer2,
	Output,
	EventEmitter,
	ViewChild,
	ViewContainerRef,
	ElementRef,
	AfterViewInit,
	ChangeDetectionStrategy
} from '@angular/core';
import { DiagramModel } from '../../models/diagram.model';
import { NodeModel } from '../../models/node.model';
import { LinkModel } from '../../models/link.model';
import { BehaviorSubject, Observable, combineLatest } from 'rxjs';
import { filter } from 'rxjs/operators';
import { BaseAction, MoveCanvasAction, SelectingAction } from '../../actions';
import { BaseModel } from '../../models/base.model';
import { MoveItemsAction } from '../../actions/move-items.action';
import { PointModel } from '../../models/point.model';
import { PortModel } from '../../models/port.model';
import { some } from 'lodash';

@Component({
	selector: 'ngdx-diagram',
	templateUrl: 'diagram.component.html',
	styleUrls: ['diagram.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class NgxDiagramComponent implements OnInit, AfterViewInit {
	// tslint:disable-next-line:no-input-rename
	@Input('model') diagramModel: DiagramModel;
	@Input() allowCanvasZoon = true;
	@Input() allowCanvasTranslation = true;
	@Input() inverseZoom = true;
	@Input() allowLooseLinks = true;

	@Output() actionStartedFiring: EventEmitter<BaseAction> = new EventEmitter();
	@Output() actionStillFiring: EventEmitter<BaseAction> = new EventEmitter();
	@Output() actionStoppedFiring: EventEmitter<BaseAction> = new EventEmitter();

	@ViewChild('nodesLayer', { read: ViewContainerRef }) nodesLayer: ViewContainerRef;
	@ViewChild('linksLayer', { read: ViewContainerRef }) linksLayer: ViewContainerRef;
	@ViewChild('canvas', { read: ElementRef }) canvas: ElementRef;

	private nodes$: Observable<{ [s: string]: NodeModel }>;
	private links$: Observable<{ [s: string]: LinkModel }>;
	private action$: BehaviorSubject<BaseAction> = new BehaviorSubject(null);
	private nodesRendered$: BehaviorSubject<boolean>;

	private mouseUpListener = () => {};
	private mouseMoveListener = () => {};

	constructor(private renderer: Renderer2) {}

	ngOnInit() {
		if (this.diagramModel) {
			this.diagramModel.getDiagramEngine().setCanvas(this.canvas.nativeElement);

			this.nodes$ = this.diagramModel.selectNodes();
			this.links$ = this.diagramModel.selectLinks();
			this.nodesRendered$ = new BehaviorSubject(false);

			this.nodes$.subscribe(nodes => {
				this.nodesRendered$.next(false);
				Object.values(nodes).forEach(node => {
					if (!node.getPainted()) {
						this.diagramModel.getDiagramEngine().generateWidgetForNode(node, this.nodesLayer);
						node.setPainted();
					}
				});
				this.nodesRendered$.next(true);
			});
		}
	}

	ngAfterViewInit() {
		combineLatest(this.nodesRendered$, this.links$)
			.pipe(filter(([nodesRendered, _]) => !!nodesRendered))
			.subscribe(([_, links]) => {
				Object.values(links).forEach(link => {
					if (!link.getPainted()) {
						if (link.getSourcePort() !== null) {
							const portCenter = this.diagramModel.getDiagramEngine().getPortCenter(link.getSourcePort());
							link.getPoints()[0].updateLocation(portCenter);

							const portCoords = this.diagramModel.getDiagramEngine().getPortCoords(link.getSourcePort());
							link.getSourcePort().updateCoords(portCoords);
						}

						if (link.getTargetPort() !== null) {
							const portCenter = this.diagramModel.getDiagramEngine().getPortCenter(link.getTargetPort());
							link.getPoints()[link.getPoints().length - 1].updateLocation(portCenter);

							const portCoords = this.diagramModel.getDiagramEngine().getPortCoords(link.getTargetPort());
							link.getTargetPort().updateCoords(portCoords);
						}

						this.diagramModel.getDiagramEngine().generateWidgetForLink(link, this.linksLayer);
						link.setPainted();
					}
				});
			});
	}

	/**
	 * fire the action registered and notify subscribers
	 */
	fireAction() {
		if (this.action$.value) {
			this.actionStillFiring.emit(this.action$.value);
		}
	}

	/**
	 * Unregister the action, post firing and notify subscribers
	 */
	stopFiringAction(shouldSkipEvent?: boolean) {
		if (!shouldSkipEvent) {
			this.actionStoppedFiring.emit(this.action$.value);
		}
		this.action$.next(null);
	}

	/**
	 * Register the new action, pre firing and notify subscribers
	 */
	startFiringAction(action: BaseAction) {
		this.action$.next(action);
		this.actionStartedFiring.emit(action);
	}

	selectAction() {
		return this.action$;
	}

	shouldDrawSelectionBox() {
		const action = this.action$.getValue();
		if (action instanceof SelectingAction) {
			action.getBoxDimensions();
			return true;
		}
		return false;
	}

	getMouseElement(event: MouseEvent): { model: BaseModel; element: Element } {
		const target = event.target as Element;

		// is it a port?
		let element = target.closest('[data-portid]');
		if (element) {
			// get the relevant node and return the port.
			const nodeEl = target.closest('[data-nodeid]');
			return {
				model: this.diagramModel.getNode(nodeEl.getAttribute('data-nodeid')).getPort(element.getAttribute('data-portid')),
				element
			};
		}

		// look for a point
		element = target.closest('[data-pointid]');
		if (element) {
			return {
				model: this.diagramModel.getLink(element.getAttribute('data-linkid')).getPointModel(element.getAttribute('data-pointid')),
				element
			};
		}

		// look for a link
		element = target.closest('[data-linkid]');
		if (element) {
			return {
				model: this.diagramModel.getLink(element.getAttribute('data-linkid')),
				element
			};
		}

		// a node maybe
		element = target.closest('[data-nodeid]');
		if (element) {
			return {
				model: this.diagramModel.getNode(element.getAttribute('data-nodeid')),
				element
			};
		}

		// just the canvas
		return null;
	}

	onMouseUp = (event: MouseEvent) => {
		const diagramEngine = this.diagramModel.getDiagramEngine();
		const action = this.action$.getValue();

		// are we going to connect a link to something?
		if (action instanceof MoveItemsAction) {
			const element = this.getMouseElement(event);
			action.selectionModels.forEach(model => {
				// only care about points connecting to things
				if (!(model.model instanceof PointModel)) {
					return;
				}
				if (element && element.model instanceof PortModel && !diagramEngine.isModelLocked(element.model)) {
					const link = model.model.getLink();
					if (link.getTargetPort() !== null) {
						// if this was a valid link already and we are adding a node in the middle, create 2 links from the original
						if (link.getTargetPort() !== element.model && link.getSourcePort() !== element.model) {
							const targetPort = link.getTargetPort();
							const newLink = link.clone({});
							newLink.setSourcePort(element.model);
							newLink.setTargetPort(targetPort);
							link.setTargetPort(element.model);
							targetPort.removeLink(link);
							newLink.removePointsBefore(newLink.getPoints()[link.getPointIndex(model.model)]);
							link.removePointsAfter(model.model);
							diagramEngine.getDiagramModel().addLink(newLink);
							// if we are connecting to the same target or source, remove tweener points
						} else if (link.getTargetPort() === element.model) {
							link.removePointsAfter(model.model);
						} else if (link.getSourcePort() === element.model) {
							link.removePointsBefore(model.model);
						}
					} else {
						link.setTargetPort(element.model);
					}
					// delete this.props.diagramEngine.linksThatHaveInitiallyRendered[link.getID()];
				}
			});

			// check for / remove any loose links in any models which have been moved
			if (!this.allowLooseLinks) {
				action.selectionModels.forEach(model => {
					// only care about points connecting to things
					if (!(model.model instanceof PointModel)) {
						return;
					}

					const selectedPoint: PointModel = model.model;
					const link: LinkModel = selectedPoint.getLink();
					if (link.getSourcePort() === null || link.getTargetPort() === null) {
						link.remove();
					}
				});
			}

			// remove any invalid links
			action.selectionModels.forEach(model => {
				// only care about points connecting to things
				if (!(model.model instanceof PointModel)) {
					return;
				}

				const link: LinkModel = model.model.getLink();
				const sourcePort: PortModel = link.getSourcePort();
				const targetPort: PortModel = link.getTargetPort();
				if (sourcePort !== null && targetPort !== null) {
					if (!sourcePort.canLinkToPort(targetPort)) {
						// link not allowed
						link.remove();
					} else if (
						some(
							Object.values(targetPort.getLinks()),
							(l: LinkModel) => l !== link && (l.getSourcePort() === sourcePort || l.getTargetPort() === sourcePort)
						)
					) {
						// link is a duplicate
						link.remove();
					}
				}
			});

			this.stopFiringAction();
		} else {
			this.stopFiringAction();
		}

		this.mouseUpListener();
		this.mouseMoveListener();
		this.action$.next(null);
	};

	onMouseMove = (event: MouseEvent) => {
		const action = this.action$.value;

		if (action === null || action === undefined) {
			return;
		}

		if (action instanceof SelectingAction) {
			const relative = this.diagramModel.getDiagramEngine().getRelativePoint(event.clientX, event.clientY);

			Object.values(this.diagramModel.getNodes()).forEach(node => {
				if ((action as SelectingAction).containsElement(node.getX(), node.getY(), this.diagramModel)) {
					node.setSelected();
				} else {
					node.setSelected(false);
				}
			});

			Object.values(this.diagramModel.getLinks()).forEach(link => {
				let allSelected = true;
				link.getPoints().forEach(point => {
					if ((action as SelectingAction).containsElement(point.getX(), point.getY(), this.diagramModel)) {
						point.setSelected();
					} else {
						point.setSelected(false);
						allSelected = false;
					}
				});

				if (allSelected) {
					link.setSelected();
				}
			});

			action.mouseX2 = relative.x;
			action.mouseY2 = relative.y;

			this.fireAction();
			this.action$.next(action);
			return;
		} else if (action instanceof MoveItemsAction) {
			const amountX = event.clientX - action.mouseX;
			const amountY = event.clientY - action.mouseY;
			const amountZoom = this.diagramModel.getZoomLevel() / 100;

			action.selectionModels.forEach(model => {
				// in this case we need to also work out the relative grid position
				if (model.model instanceof NodeModel || (model.model instanceof PointModel && !model.model.isConnectedToPort())) {
					model.model.setX(this.diagramModel.getGridPosition(model.initialX + amountX / amountZoom));
					model.model.setY(this.diagramModel.getGridPosition(model.initialY + amountY / amountZoom));

					if (model.model instanceof NodeModel) {
						// update port coordinates as well
						Object.values(model.model.getPorts()).forEach(port => {
							const portCoords = this.diagramModel.getDiagramEngine().getPortCoords(port);
							port.updateCoords(portCoords);
						});
					}
				} else if (model.model instanceof PointModel) {
					// we want points that are connected to ports, to not necessarily snap to grid
					// this stuff needs to be pixel perfect, dont touch it
					model.model.setX(model.initialX + this.diagramModel.getGridPosition(amountX / amountZoom));
					model.model.setY(model.initialY + this.diagramModel.getGridPosition(amountY / amountZoom));
				}
			});

			this.fireAction();
		} else if (action instanceof MoveCanvasAction) {
			if (this.allowCanvasTranslation) {
				this.diagramModel.setOffset(
					action.initialOffsetX + (event.clientX - action.mouseX),
					action.initialOffsetY + (event.clientY - action.mouseY)
				);
				this.fireAction();
			}
		}
	};

	onMouseDown(event: MouseEvent) {
		if (event.button === 3) {
			return;
		}

		const selectedModel = this.getMouseElement(event);
		console.log(selectedModel);
		// canvas selected
		if (selectedModel === null) {
			// multiple selection
			if (event.shiftKey) {
				// initiate multiple selection selector
				const relative = this.diagramModel.getDiagramEngine().getRelativePoint(event.clientX, event.clientY);
				this.startFiringAction(new SelectingAction(relative.x, relative.y));
			} else {
				// drag canvas action
				this.diagramModel.clearSelection();
				this.startFiringAction(new MoveCanvasAction(event.clientX, event.clientY, this.diagramModel));
			}
		} else if (selectedModel.model instanceof PortModel) {
			// its a port element, we want to drag a link
			if (!this.diagramModel.getDiagramEngine().isModelLocked(selectedModel.model)) {
				const relative = this.diagramModel.getDiagramEngine().getRelativeMousePoint(event);
				const sourcePort = selectedModel.model;
				const link = sourcePort.createLinkModel();
				link.setSourcePort(sourcePort);

				if (link) {
					link.removeMiddlePoints();
					if (link.getSourcePort() !== sourcePort) {
						link.setSourcePort(sourcePort);
					}
					link.setTargetPort(null);

					link.getFirstPoint().updateLocation(relative);
					link.getLastPoint().updateLocation(relative);

					this.diagramModel.clearSelection();
					link.getLastPoint().setSelected();
					this.diagramModel.addLink(link);

					this.startFiringAction(new MoveItemsAction(event.clientX, event.clientY, this.diagramModel.getDiagramEngine()));
				}
			} else {
				this.diagramModel.clearSelection();
			}
		} else {
			// its some other element, probably want to move it
			if (!event.shiftKey && !selectedModel.model.getSelected) {
				this.diagramModel.clearSelection();
			}
			selectedModel.model.setSelected();

			this.startFiringAction(new MoveItemsAction(event.clientX, event.clientY, this.diagramModel.getDiagramEngine()));
		}

		// create mouseMove and mouseUp listeners
		this.mouseMoveListener = this.renderer.listen(document, 'mousemove', this.onMouseMove);
		this.mouseUpListener = this.renderer.listen(document, 'mouseup', this.onMouseUp);
	}

	onMouseWheel(event: WheelEvent) {
		if (this.allowCanvasZoon) {
			event.preventDefault();
			event.stopPropagation();
			const currentZoomLevel = this.diagramModel.getZoomLevel();
			const oldZoomFactor = currentZoomLevel / 100;
			let scrollDelta = this.inverseZoom ? -event.deltaY : event.deltaY;
			// check if it is pinch gesture
			if (event.ctrlKey && scrollDelta % 1 !== 0) {
				/* Chrome and Firefox sends wheel event with deltaY that
				   have fractional part, also `ctrlKey` prop of the event is true
				   though ctrl isn't pressed
				*/
				scrollDelta /= 3;
			} else {
				scrollDelta /= 60;
			}
			if (currentZoomLevel + scrollDelta > 10) {
				this.diagramModel.setZoomLevel(currentZoomLevel + scrollDelta);
			}

			const zoomFactor = this.diagramModel.getZoomLevel() / 100;

			const boundingRect = (event.currentTarget as Element).getBoundingClientRect();
			const clientWidth = boundingRect.width;
			const clientHeight = boundingRect.height;

			// compute difference between rect before and after scroll
			const widthDiff = clientWidth * zoomFactor - clientWidth * oldZoomFactor;
			const heightDiff = clientHeight * zoomFactor - clientHeight * oldZoomFactor;
			// compute mouse coords relative to canvas

			const clientX = event.clientX - boundingRect.left;
			const clientY = event.clientY - boundingRect.top;

			// compute width and height increment factor
			const xFactor = (clientX - this.diagramModel.getOffsetX()) / oldZoomFactor / clientWidth;
			const yFactor = (clientY - this.diagramModel.getOffsetY()) / oldZoomFactor / clientHeight;

			this.diagramModel.setOffset(
				this.diagramModel.getOffsetX() - widthDiff * xFactor,
				this.diagramModel.getOffsetY() - heightDiff * yFactor
			);
		}
	}
}