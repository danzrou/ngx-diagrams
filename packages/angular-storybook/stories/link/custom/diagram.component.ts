import { Component, Input, OnInit, ViewChild } from '@angular/core';
import { DiagramModel, NodeModel, LinkModel, PortModel, RxZuDiagramComponent } from '@rxzu/angular';

@Component({
  selector: 'app-root',
  template: `<rxzu-diagram
    class="demo-diagram"
    [model]="diagramModel"
  ></rxzu-diagram>`,
  styleUrls: ['../../demo-diagram.component.scss']
})
export class CustomLinkDiagramComponent implements OnInit {
  diagramModel: DiagramModel;
  @Input() nodeHeight = 200;
  @Input() nodeWidth = 200;
  @ViewChild(RxZuDiagramComponent, { static: true }) diagram?: RxZuDiagramComponent;

  constructor() {
    this.diagramModel = new DiagramModel({ type: 'default' });
  }

  ngOnInit() {
    const nodesDefaultDimensions = {
      height: this.nodeHeight,
      width: this.nodeWidth
    };

    const node1 = new NodeModel({
      type: 'default',
      coords: { x: 500, y: 300 },
      dimensions: nodesDefaultDimensions,
    });

    const outport1 = new PortModel({
      name: 'outport1',
      linkType: 'custom-link',
      maximumLinks: 3,
      type: 'default',
    });
    node1.addPort(outport1);

    const node2 = new NodeModel({
      type: 'default',
      coords: { x: 1000, y: 300 },
      dimensions: nodesDefaultDimensions,
    });

    const inport = new PortModel({ type: 'default', name: 'inport2' });
    node2.addPort(inport);

    const link = new LinkModel({ type: 'custom-link' });

    link.setSourcePort(outport1);
    link.setTargetPort(inport);

    this.diagramModel.addAll(node1, node2, link);

    this.diagram?.zoomToFit();
  }
}
