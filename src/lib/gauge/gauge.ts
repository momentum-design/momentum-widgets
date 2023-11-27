import { ChartConfiguration, ChartDataset, ChartOptions, ChartType as ChartJSType } from 'chart.js/auto';
import { chartA11y, chartLegendA11y } from '../../core/plugins';
import { tableDataToJSON } from '../../helpers/data';
import { toChartJSType } from '../../helpers/utils';
import { ChartData, ChartType, TableData } from '../../types';
import { Chart } from '../.internal';
import { DataView, GaugeData, GaugeDataModel, GaugeOptions } from './gauge.type';

export class GaugeChart extends Chart<GaugeData, GaugeOptions> {
  private chartColors: string[] = [];

  getTableData(): TableData {
    throw new Error('Method not implemented.');
  }

  static readonly defaultsOptions: GaugeOptions = {
    legend: {
      display: false,
    },
    innerRadius: '90%',
    padding: {
      left: 30,
      right: 30,
    },
  };

  protected chartData: DataView = {
    category: {
      name: undefined,
      labels: undefined,
    },
    series: [],
    value: 0,
  };

  protected getType(): ChartType {
    return ChartType.Gauge;
  }

  protected getDefaultOptions(): GaugeOptions {
    return GaugeChart.defaultsOptions;
  }

  protected getConfiguration(): ChartConfiguration {
    let chartLabels: unknown[] = [];
    let chartDatasets: ChartDataset<ChartJSType, number[]>[] = [];
    this.getChartData();
    if (this.chartData && this.chartData.category.labels) {
      chartLabels = this.chartData.category.labels ?? [];
      chartDatasets = this.getDatasets();
    }

    return {
      type: ChartType.Pie,
      data: {
        labels: chartLabels,
        datasets: chartDatasets,
      },
      options: this.getChartOptions(),
      plugins: [chartA11y, chartLegendA11y, this.createPointerNeedle()],
    };
  }

  protected getChartData(): void {
    if (!this.data) {
      return;
    }
    const { dialData, value } = this.convertToData();
    if (dialData.length > 0) {
      const genericData = this.transformGenericData(dialData);
      this.chartData = this.convertToDataView(genericData, value);
    }
  }

  private getDatasets(): ChartDataset<ChartJSType, number[]>[] {
    const chartDataset: ChartDataset<ChartJSType, number[]>[] = [];
    if (Array.isArray(this.chartData?.series)) {
      this.chartColors = this.getColorsForKeys(this.chartData?.category?.labels as string[]);
      this.chartData?.series?.forEach((series) => {
        const dataset: ChartDataset<ChartJSType, number[]> = this.getChartDataset(series);
        if (dataset) {
          chartDataset.push(dataset);
        }
      });
    }
    return chartDataset;
  }

  private getChartOptions(): ChartOptions {
    let options: ChartOptions = {
      plugins: {
        legend: {
          display: this.options.legend?.display,
        },
      },
      layout: {
        padding: this.options.padding,
      },
    };
    options = this.afterOptionsCreated(options);
    return options;
  }

  protected getChartDataset(series: { name?: string; data?: number[] }): ChartDataset<ChartJSType, number[]> {
    return {
      data: Object.values(series.data ?? []) as number[],
      label: series.name,
      type: toChartJSType(this.getType()),
      backgroundColor: this.chartColors,
    };
  }

  private convertToData(): GaugeData {
    let data: GaugeData = {
      dialData: [],
      value: 0,
    };
    if (this.data instanceof Array) {
      data = {
        dialData: this.data[0].dialData ? [this.data[0].dialData] : [],
        value: this.data[0].value || 0,
      };
    } else if (typeof this.data === 'object') {
      data = {
        dialData: this.data.dialData ? [this.data.dialData] : [],
        value: this.data.value || 0,
      };
    }
    return data;
  }

  private transformGenericData(sourceData: ChartData): GaugeDataModel {
    const result: GaugeDataModel = {
      data: [],
    };

    if (typeof sourceData[0] === 'object' && !Array.isArray(sourceData[0])) {
      const data = sourceData as Record<string, string | number>[];
      result.data = data;
    } else if (Array.isArray(sourceData[0])) {
      const data = sourceData as unknown[][];
      result.data = tableDataToJSON(data);
    }

    return result;
  }

  private convertToDataView(data: GaugeDataModel, value: number): DataView {
    const result: DataView = {
      category: {
        name: '',
        labels: [],
      },
      series: [],
      value,
    };

    result.category.labels = Object.keys(data.data[0]);
    const seriesData = data.data.map((_data) => {
      return {
        name: '',
        data: result.category.labels?.map((key) => _data[key as string]) as number[],
      };
    });

    result.series = seriesData;
    return result;
  }

  private createPointerNeedle() {
    return {
      id: 'gaugeNeedle',
      afterDatasetDraw: (chart: any, args: any) => {
        const {
          ctx,
          chartArea: { left, right },
        } = chart;
        const dataTotal = args.meta.total;
        const chartValue = this.chartData.value;
        const averageValue = dataTotal / 2;
        const angle = Math.PI + (1 / dataTotal) * chartValue * Math.PI;

        const cx = chart.getDatasetMeta(0).data[0].x;
        const cy = chart.getDatasetMeta(0).data[0].y;
        const fontColor = this.options.font?.color;
        const fontFamily = this.options.font?.family;
        ctx.save();

        // Needle
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(0, -2);
        ctx.lineTo(cy - 80, 0);
        ctx.lineTo(0, 2);
        ctx.fillStyle = '#000';
        ctx.fill();

        // Needle dot
        ctx.translate(-cx, -cy);
        ctx.arc(cx, cy, 5, 0, 10);
        ctx.fill();
        ctx.restore();

        // Font
        ctx.font = `16px ${fontFamily}`;
        ctx.fillStyle = fontColor;
        ctx.textAlign = 'center';
        ctx.fillText(chartValue.toString(), cx, cy + 20);
        ctx.textAlign = 'center';
        ctx.fillText(averageValue.toString(), cx, 40);
        ctx.textAlign = 'left';
        ctx.fillText('0', left - 20, cy);
        ctx.textAlign = 'right';
        ctx.fillText(dataTotal.toString(), right + 30, cy);
        ctx.restore();
      },
    };
  }

  protected afterOptionsCreated(options: ChartOptions): ChartOptions {
    const _options = options as ChartOptions<'doughnut'>;
    _options.responsive = true;
    _options.aspectRatio = 1.6;
    _options.circumference = 180;
    _options.rotation = 270;
    _options.cutout = this.options.innerRadius;
    return _options as ChartOptions;
  }
}
