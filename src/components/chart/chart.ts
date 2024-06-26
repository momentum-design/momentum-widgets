/* eslint-disable @typescript-eslint/no-empty-interface */
import { css, CSSResult, CSSResultGroup, CSSResultOrNative, html, LitElement, TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { createChart } from '../../charts';
import { Chart } from '../../charts/.internal';
import { COMPONENT_PREFIX, requestFromPattern } from '../../core';
import { debounce, wrapSelector } from '../../helpers';
import { ChartData, ChartEvent, ChartEventType, ChartOptions, ChartType, LegendItem } from '../../types';

const tag = `${COMPONENT_PREFIX}-chart`;

/**
 * The chart component for rendering all charts that extends {@link LitElement}.
 *
 * @category Components
 *
 * @example
 * ```html
 * <md-chart type="pie"
 *   data='{
 *    "Alabama": 13,
 *    "Colorado": 17,
 *    "Arizona": 8,
 *    "Vermont": 10}'
 * ></md-chart>
 * ```
 *
 * @typeParam TData - the type of chart data
 * @typeParam TOptions - the type of chart options
 */
@customElement(tag)
export class ChartComponent<TData extends ChartData, TOptions extends ChartOptions> extends LitElement {
  static tag = tag;
  static disableShadowRoot = true;
  static get styles(): CSSResult {
    return css`
      ${wrapSelector(this, ':host')} {
        display: block;
        position: relative;
      }
    `;
  }

  chart?: Chart<ChartData, ChartOptions>;

  /**
   * Type of the chart.
   *
   * Should be one of:
   * - `pie`
   * - `gauge`
   * - `doughnut`
   * - `bar`
   * - `column`
   * - `line`
   * - `area`
   * - `range`
   */
  @property({ type: String, reflect: true })
  type?: string;

  /**
   * The data for current chart.
   */
  @property({
    type: Object,
    hasChanged: (newVal, oldVal) => {
      return JSON.stringify(newVal) !== JSON.stringify(oldVal);
    },
  })
  data?: TData;

  @property({ attribute: 'data-url', type: String })
  dataUrl?: string;

  /**
   * The options for current chat.
   */
  @property({
    type: Object,
    hasChanged: (newVal, oldVal) => {
      return JSON.stringify(newVal) !== JSON.stringify(oldVal);
    },
  })
  options?: TOptions;

  @property({ type: Object, hasChanged: () => true })
  states?: { selectedLegendItems?: LegendItem[]; selectedCategoryLabels?: string[] };

  private boundResizeHandler: () => void;
  private canvasResizeObserver: ResizeObserver | undefined;
  private chartResizeObserver: ResizeObserver | undefined;

  private debounceId?: ReturnType<typeof setTimeout>;

  private onLegendItemSelect = (event: ChartEvent<LegendItem>) => {
    if (event.context?.data) {
      this.chart?.legend?.selectItem(event.context?.data);
    }
  };
  private onLegendItemUnselect = (event: ChartEvent<LegendItem>) => {
    if (event.context?.data) {
      this.chart?.legend?.unselectItem(event.context?.data);
    }
  };

  private onThemeChange = (event: CustomEvent<string>) => {
    if (event.detail) {
      this.chart?.changeTheme(event.detail);
    }
  };

  constructor() {
    super();
    this.boundResizeHandler = this.handleResize.bind(this);
  }

  protected createRenderRoot(): Element | ShadowRoot {
    return this;
  }

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener('resize', this.boundResizeHandler); //TODO(yiwei): Check whether windows resize still needs to be retained
    this.renderRoot.addEventListener(ChartEventType.LegendItemSelect, this.onLegendItemSelect as EventListener);
    this.renderRoot.addEventListener(ChartEventType.LegendItemUnselect, this.onLegendItemUnselect as EventListener);
    document.addEventListener(ChartEventType.ThemeChange, this.onThemeChange as EventListener);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener('resize', this.boundResizeHandler);
    this.renderRoot.removeEventListener(ChartEventType.LegendItemSelect, this.onLegendItemSelect as EventListener);
    this.renderRoot.removeEventListener(ChartEventType.LegendItemUnselect, this.onLegendItemUnselect as EventListener);
    document.removeEventListener(ChartEventType.ThemeChange, this.onThemeChange as EventListener);
    if (this.chart?.removeCustomEventListener) {
      this.chart.removeCustomEventListener();
    }
    this.destroy();
  }

  render(): TemplateResult {
    if (this.id) {
      return html`<canvas id="${this.id}_container"></canvas>`;
    }
    return html`<canvas></canvas>`;
  }

  updated(changedProperties: Map<PropertyKey, unknown>): void {
    super.updated(changedProperties);

    if (changedProperties.has('dataUrl')) {
      this.updateDataFromAPI();
    }

    if (changedProperties.has('type') || changedProperties.has('data') || changedProperties.has('options')) {
      this.debounceId = debounce(
        this.debounceId,
        () => {
          this.initChart();
        },
        100,
      );
    }

    if (changedProperties.has('states')) {
      if (typeof this.states?.selectedLegendItems !== 'undefined') {
        this.chart?.legend?.changeSelectedItems(this.states.selectedLegendItems);
      }
      if (typeof this.states?.selectedCategoryLabels !== 'undefined' && this.chart?.getCategoryLabelSelectable) {
        this.chart.getCategoryLabelSelectable().changeSelectedLabels(this.states.selectedCategoryLabels);
      }
    }
  }

  destroy(): void {
    this.unobserveResize();

    if (this.chart) {
      this.chart.destroy();
    }
  }

  /**
   * Resizes the chart and something else that will be useful if the window changed.
   */
  protected handleResize(): void {
    this.chart?.resize();
  }

  /**
   * Initializes and renders the chart.
   */
  protected initChart(): void {
    if (this.data && this.type) {
      this.destroy();
      this.chart = createChart(
        this.renderRoot.querySelector('canvas') as HTMLCanvasElement,
        this.type as ChartType,
        this.data,
        this.options,
      );
      this.chart.render();
      this.observeChartResize();
      this.observeCanvasResize();

      if (this.chart.addCustomEventListener) {
        this.chart.addCustomEventListener();
      }
    }
  }

  /**
   * Updates the chart.
   */
  protected updateChart(): void {
    this.chart?.update();
  }

  protected static finalizeStyles(styles?: CSSResultGroup): CSSResultOrNative[] {
    let elementStyles = super.finalizeStyles(styles);
    const styleRoot = document.head;
    if (this.disableShadowRoot) {
      // WARNING: This break component encapsulation and applies styles to the document.
      // These styles should be manually scoped.
      elementStyles.forEach((s: CSSResultOrNative) => {
        const style = document.createElement('style');
        if (s instanceof CSSResult) {
          style.textContent = s.cssText;
        }
        styleRoot.appendChild(style);
      });
      elementStyles = [];
    }
    return elementStyles;
  }

  private observeChartResize(): void {
    this.chartResizeObserver = new ResizeObserver(() => {
      this.chart?.api?.resize();
    });
    if (this.chart?.api?.canvas.parentElement) {
      this.chartResizeObserver.observe(this.chart.api.canvas.parentElement);
    }
  }

  private observeCanvasResize(): void {
    this.canvasResizeObserver = new ResizeObserver(() => {
      this.chart?.resize();
    });
    if (this.chart?.api?.canvas) {
      this.canvasResizeObserver.observe(this.chart.api.canvas);
    }
  }

  private unobserveResize(): void {
    if (this.canvasResizeObserver && this.chart?.api?.canvas) {
      this.canvasResizeObserver.unobserve(this.chart.api.canvas);
    }
    if (this.chartResizeObserver && this.chart?.api?.canvas.parentElement) {
      this.chartResizeObserver?.unobserve(this.chart.api.canvas.parentElement);
    }
  }

  private updateDataFromAPI(): void {
    if (this.dataUrl) {
      requestFromPattern(this.dataUrl).then((data) => {
        this.setAttribute('data', JSON.stringify(data));
      });
    }
  }
}
