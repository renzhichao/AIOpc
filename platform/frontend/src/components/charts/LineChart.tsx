/**
 * LineChart Component
 *
 * Displays time-series data as a line chart using Recharts.
 * Supports multiple data series and customizable styling.
 *
 * Features:
 * - Responsive design
 * - Multiple data series
 * - Customizable colors
 * - Tooltip with detailed information
 * - Legend for series identification
 */

import React from 'react';
import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

export interface LineChartData {
  timestamp: string;
  [key: string]: string | number;
}

export interface LineChartSeries {
  dataKey: string;
  name: string;
  color: string;
  strokeWidth?: number;
  dot?: boolean;
}

interface LineChartProps {
  data: LineChartData[];
  series: LineChartSeries[];
  height?: number;
  xAxisDataKey?: string;
  showGrid?: boolean;
  showTooltip?: boolean;
  showLegend?: boolean;
}

// Custom tooltip component (defined outside render to avoid recreating on each render)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload || !payload.length) {
    return null;
  }

  const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const hours = Math.abs(now.getTime() - date.getTime()) / 36e5;

    if (hours < 1) {
      // Less than 1 hour, show minutes
      return date.toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } else if (hours < 24) {
      // Less than 24 hours, show hours
      return date.toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } else {
      // More than 24 hours, show date
      return date.toLocaleDateString('zh-CN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
        {formatTimestamp(payload[0].payload.timestamp)}
      </p>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {payload.map((entry: any, index: number) => (
        <p key={index} className="text-sm" style={{ color: entry.color }}>
          {entry.name}: {typeof entry.value === 'number' ? entry.value.toFixed(2) : entry.value}
        </p>
      ))}
    </div>
  );
};

export const LineChart: React.FC<LineChartProps> = ({
  data,
  series,
  height = 300,
  xAxisDataKey = 'timestamp',
  showGrid = true,
  showTooltip = true,
  showLegend = true,
}) => {
  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={height}>
        <RechartsLineChart
          data={data}
          margin={{
            top: 5,
            right: 30,
            left: 20,
            bottom: 5,
          }}
        >
          {showGrid && (
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#e5e7eb"
              className="dark:stroke-gray-700"
            />
          )}
          <XAxis
            dataKey={xAxisDataKey}
            tickFormatter={(value) => {
              const date = new Date(value);
              const now = new Date();
              const hours = Math.abs(now.getTime() - date.getTime()) / 36e5;

              if (hours < 1) {
                return date.toLocaleTimeString('zh-CN', {
                  hour: '2-digit',
                  minute: '2-digit',
                });
              } else if (hours < 24) {
                return date.toLocaleTimeString('zh-CN', {
                  hour: '2-digit',
                  minute: '2-digit',
                });
              } else {
                return date.toLocaleDateString('zh-CN', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });
              }
            }}
            tick={{ fill: '#6b7280', fontSize: 12 }}
            stroke="#9ca3af"
          />
          <YAxis
            tick={{ fill: '#6b7280', fontSize: 12 }}
            stroke="#9ca3af"
          />
          {showTooltip && <Tooltip content={<CustomTooltip />} />}
          {showLegend && (
            <Legend
              wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}
            />
          )}
          {series.map((s) => (
            <Line
              key={s.dataKey}
              type="monotone"
              dataKey={s.dataKey}
              name={s.name}
              stroke={s.color}
              strokeWidth={s.strokeWidth || 2}
              dot={s.dot !== undefined ? s.dot : false}
              activeDot={{ r: 5 }}
            />
          ))}
        </RechartsLineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default LineChart;
