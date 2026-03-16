/**
 * E2E Test Report Generator
 *
 * Generates comprehensive test reports for end-to-end tests.
 * Provides multiple output formats and detailed analysis.
 *
 * Features:
 * - Text-based console reports
 * - JSON reports for CI/CD integration
 * - HTML reports for detailed analysis
 * - Coverage metrics
 * - Performance metrics
 * - Failure analysis
 */

import fs from 'fs';
import path from 'path';
import { TestReport, TestResult } from './orchestrator';

export interface ReportOptions {
  outputDir?: string;
  format?: 'text' | 'json' | 'html' | 'all';
  includeStackTrace?: boolean;
  includePerformanceMetrics?: boolean;
  includeCoverage?: boolean;
}

export interface PerformanceMetrics {
  averageDuration: number;
  minDuration: number;
  maxDuration: number;
  percentiles: {
    p50: number;
    p75: number;
    p90: number;
    p95: number;
    p99: number;
  };
}

export interface CoverageMetrics {
  scenarios: number;
  userJourneys: number;
  edgeCases: number;
  total: number;
  percentage: number;
}

export class E2EReporter {
  private static readonly DEFAULT_OUTPUT_DIR = path.join(process.cwd(), 'test-reports', 'e2e');

  /**
   * Generate test report
   */
  static generateReport(
    report: TestReport,
    options: ReportOptions = {}
  ): void {
    const outputDir = options.outputDir || this.DEFAULT_OUTPUT_DIR;
    const format = options.format || 'all';

    // Ensure output directory exists
    this.ensureOutputDir(outputDir);

    // Generate reports based on format
    if (format === 'text' || format === 'all') {
      this.generateTextReport(report, outputDir, options);
    }

    if (format === 'json' || format === 'all') {
      this.generateJsonReport(report, outputDir);
    }

    if (format === 'html' || format === 'all') {
      this.generateHtmlReport(report, outputDir, options);
    }
  }

  /**
   * Generate text report
   */
  private static generateTextReport(
    report: TestReport,
    outputDir: string,
    options: ReportOptions
  ): void {
    const lines: string[] = [];

    // Header
    lines.push('='.repeat(80));
    lines.push('E2E Test Report');
    lines.push('='.repeat(80));
    lines.push('');

    // Test run information
    lines.push('Test Run Information:');
    lines.push(`  Run ID: ${report.runId}`);
    lines.push(`  Start Time: ${report.startTime.toISOString()}`);
    lines.push(`  End Time: ${report.endTime.toISOString()}`);
    lines.push(`  Duration: ${this.formatDuration(report.duration)}`);
    lines.push('');

    // Environment information
    lines.push('Environment:');
    lines.push(`  Database: ${report.environment.database.host}:${report.environment.database.port}/${report.environment.database.database}`);
    lines.push(`  Docker: ${report.environment.docker.version}`);
    lines.push(`  Containers: ${report.environment.docker.containers}`);
    lines.push(`  Images: ${report.environment.docker.images}`);
    lines.push('');

    // Summary
    lines.push('Summary:');
    lines.push(`  Total: ${report.summary.total}`);
    lines.push(`  Passed: ${report.summary.passed} ✓`);
    lines.push(`  Failed: ${report.summary.failed} ✗`);
    lines.push(`  Skipped: ${report.summary.skipped} ⊘`);
    lines.push(`  Success Rate: ${report.summary.successRate.toFixed(2)}%`);
    lines.push('');

    // Pass/Fail indicator
    if (report.summary.failed === 0) {
      lines.push('✓ All tests passed!');
    } else {
      lines.push(`✗ ${report.summary.failed} test(s) failed`);
    }
    lines.push('');

    // Test results
    if (report.results.length > 0) {
      lines.push('-'.repeat(80));
      lines.push('Test Results:');
      lines.push('-'.repeat(80));
      lines.push('');

      report.results.forEach((result, index) => {
        const status = result.status === 'passed' ? '✓' : result.status === 'failed' ? '✗' : '⊘';
        lines.push(`${index + 1}. ${status} ${result.scenario} (${result.duration}ms)`);

        if (result.error && options.includeStackTrace) {
          lines.push(`   Error: ${result.error.message}`);
          lines.push(`   Stack: ${result.error.stack}`);
        }

        if (result.metadata) {
          lines.push(`   Metadata: ${JSON.stringify(result.metadata, null, 2).split('\n').join('\n   ')}`);
        }

        lines.push('');
      });
    }

    // Performance metrics
    if (options.includePerformanceMetrics) {
      const metrics = this.calculatePerformanceMetrics(report.results);
      lines.push('-'.repeat(80));
      lines.push('Performance Metrics:');
      lines.push('-'.repeat(80));
      lines.push('');
      lines.push(`  Average Duration: ${metrics.averageDuration.toFixed(2)}ms`);
      lines.push(`  Min Duration: ${metrics.minDuration}ms`);
      lines.push(`  Max Duration: ${metrics.maxDuration}ms`);
      lines.push(`  P50: ${metrics.percentiles.p50.toFixed(2)}ms`);
      lines.push(`  P75: ${metrics.percentiles.p75.toFixed(2)}ms`);
      lines.push(`  P90: ${metrics.percentiles.p90.toFixed(2)}ms`);
      lines.push(`  P95: ${metrics.percentiles.p95.toFixed(2)}ms`);
      lines.push(`  P99: ${metrics.percentiles.p99.toFixed(2)}ms`);
      lines.push('');
    }

    // Coverage
    if (options.includeCoverage && report.coverage) {
      lines.push('-'.repeat(80));
      lines.push('Coverage:');
      lines.push('-'.repeat(80));
      lines.push('');
      lines.push(`  Scenarios: ${report.coverage.scenarios}`);
      lines.push(`  User Journeys: ${report.coverage.userJourneys}`);
      lines.push(`  Edge Cases: ${report.coverage.edgeCases}`);
      lines.push(`  Total: ${report.coverage.total}`);
      lines.push(`  Coverage: ${report.coverage.percentage.toFixed(2)}%`);
      lines.push('');
    }

    // Footer
    lines.push('='.repeat(80));
    lines.push('End of Report');
    lines.push('='.repeat(80));

    // Write to file
    const outputPath = path.join(outputDir, `e2e-report-${Date.now()}.txt`);
    fs.writeFileSync(outputPath, lines.join('\n'));
    console.log(`\n✓ Text report generated: ${outputPath}`);

    // Also print to console
    console.log('\n' + lines.join('\n'));
  }

  /**
   * Generate JSON report
   */
  private static generateJsonReport(
    report: TestReport,
    outputDir: string
  ): void {
    const jsonReport = {
      ...report,
      performanceMetrics: this.calculatePerformanceMetrics(report.results),
      generatedAt: new Date().toISOString(),
    };

    const outputPath = path.join(outputDir, `e2e-report-${Date.now()}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(jsonReport, null, 2));
    console.log(`✓ JSON report generated: ${outputPath}`);
  }

  /**
   * Generate HTML report
   */
  private static generateHtmlReport(
    report: TestReport,
    outputDir: string,
    options: ReportOptions
  ): void {
    const performanceMetrics = this.calculatePerformanceMetrics(report.results);

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>E2E Test Report - ${report.runId}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            color: #333;
            background: #f5f5f5;
            padding: 20px;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
            color: #2c3e50;
            margin-bottom: 10px;
            font-size: 32px;
        }
        .subtitle {
            color: #7f8c8d;
            margin-bottom: 30px;
            font-size: 14px;
        }
        .section {
            margin-bottom: 30px;
        }
        .section-title {
            font-size: 20px;
            color: #2c3e50;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 2px solid #3498db;
        }
        .info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 15px;
            margin-bottom: 20px;
        }
        .info-item {
            background: #ecf0f1;
            padding: 15px;
            border-radius: 5px;
        }
        .info-label {
            font-weight: 600;
            color: #2c3e50;
            font-size: 12px;
            text-transform: uppercase;
            margin-bottom: 5px;
        }
        .info-value {
            color: #34495e;
            font-size: 14px;
        }
        .summary-cards {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 15px;
            margin-bottom: 20px;
        }
        .summary-card {
            padding: 20px;
            border-radius: 5px;
            text-align: center;
            color: white;
        }
        .summary-card.total { background: #3498db; }
        .summary-card.passed { background: #27ae60; }
        .summary-card.failed { background: #e74c3c; }
        .summary-card.skipped { background: #95a5a6; }
        .summary-card-label {
            font-size: 12px;
            text-transform: uppercase;
            margin-bottom: 10px;
        }
        .summary-card-value {
            font-size: 32px;
            font-weight: 700;
        }
        .success-rate {
            background: ${report.summary.successRate >= 80 ? '#d4edda' : '#f8d7da'};
            color: ${report.summary.successRate >= 80 ? '#155724' : '#721c24'};
            padding: 15px;
            border-radius: 5px;
            text-align: center;
            font-size: 18px;
            font-weight: 600;
        }
        .test-results {
            margin-top: 20px;
        }
        .test-result {
            background: #f8f9fa;
            padding: 15px;
            margin-bottom: 10px;
            border-radius: 5px;
            border-left: 4px solid #bdc3c7;
        }
        .test-result.passed { border-left-color: #27ae60; }
        .test-result.failed { border-left-color: #e74c3c; }
        .test-result.skipped { border-left-color: #95a5a6; }
        .test-result-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }
        .test-result-name {
            font-weight: 600;
            color: #2c3e50;
        }
        .test-result-status {
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
        }
        .test-result.passed .test-result-status { background: #d4edda; color: #155724; }
        .test-result.failed .test-result-status { background: #f8d7da; color: #721c24; }
        .test-result.skipped .test-result-status { background: #e9ecef; color: #495057; }
        .test-result-duration {
            color: #7f8c8d;
            font-size: 12px;
        }
        .test-result-error {
            background: #f8d7da;
            color: #721c24;
            padding: 10px;
            border-radius: 3px;
            margin-top: 10px;
            font-size: 13px;
        }
        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
        }
        .metric-card {
            background: #ecf0f1;
            padding: 15px;
            border-radius: 5px;
            text-align: center;
        }
        .metric-value {
            font-size: 24px;
            font-weight: 700;
            color: #2c3e50;
        }
        .metric-label {
            font-size: 12px;
            color: #7f8c8d;
            margin-top: 5px;
        }
        .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #ecf0f1;
            text-align: center;
            color: #95a5a6;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>E2E Test Report</h1>
        <div class="subtitle">Generated: ${new Date().toISOString()}</div>

        <div class="section">
            <div class="section-title">Test Run Information</div>
            <div class="info-grid">
                <div class="info-item">
                    <div class="info-label">Run ID</div>
                    <div class="info-value">${report.runId}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Duration</div>
                    <div class="info-value">${this.formatDuration(report.duration)}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Start Time</div>
                    <div class="info-value">${report.startTime.toISOString()}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">End Time</div>
                    <div class="info-value">${report.endTime.toISOString()}</div>
                </div>
            </div>
        </div>

        <div class="section">
            <div class="section-title">Summary</div>
            <div class="summary-cards">
                <div class="summary-card total">
                    <div class="summary-card-label">Total</div>
                    <div class="summary-card-value">${report.summary.total}</div>
                </div>
                <div class="summary-card passed">
                    <div class="summary-card-label">Passed</div>
                    <div class="summary-card-value">${report.summary.passed}</div>
                </div>
                <div class="summary-card failed">
                    <div class="summary-card-label">Failed</div>
                    <div class="summary-card-value">${report.summary.failed}</div>
                </div>
                <div class="summary-card skipped">
                    <div class="summary-card-label">Skipped</div>
                    <div class="summary-card-value">${report.summary.skipped}</div>
                </div>
            </div>
            <div class="success-rate">
                Success Rate: ${report.summary.successRate.toFixed(2)}%
            </div>
        </div>

        ${options.includePerformanceMetrics ? `
        <div class="section">
            <div class="section-title">Performance Metrics</div>
            <div class="metrics-grid">
                <div class="metric-card">
                    <div class="metric-value">${performanceMetrics.averageDuration.toFixed(2)}ms</div>
                    <div class="metric-label">Average Duration</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">${performanceMetrics.minDuration}ms</div>
                    <div class="metric-label">Min Duration</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">${performanceMetrics.maxDuration}ms</div>
                    <div class="metric-label">Max Duration</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">${performanceMetrics.percentiles.p95.toFixed(2)}ms</div>
                    <div class="metric-label">P95 Duration</div>
                </div>
            </div>
        </div>
        ` : ''}

        <div class="section">
            <div class="section-title">Test Results</div>
            <div class="test-results">
                ${report.results.map(result => `
                    <div class="test-result ${result.status}">
                        <div class="test-result-header">
                            <div class="test-result-name">${result.scenario}</div>
                            <div>
                                <span class="test-result-status">${result.status}</span>
                                <span class="test-result-duration">${result.duration}ms</span>
                            </div>
                        </div>
                        ${result.error && options.includeStackTrace ? `
                            <div class="test-result-error">
                                <strong>Error:</strong> ${result.error.message}
                                ${options.includeStackTrace ? `<br><br><pre>${result.error.stack}</pre>` : ''}
                            </div>
                        ` : ''}
                    </div>
                `).join('')}
            </div>
        </div>

        <div class="footer">
            Generated by E2E Test Reporter | AIOpc Platform
        </div>
    </div>
</body>
</html>
    `;

    const outputPath = path.join(outputDir, `e2e-report-${Date.now()}.html`);
    fs.writeFileSync(outputPath, html);
    console.log(`✓ HTML report generated: ${outputPath}`);
  }

  /**
   * Calculate performance metrics
   */
  private static calculatePerformanceMetrics(results: TestResult[]): PerformanceMetrics {
    if (results.length === 0) {
      return {
        averageDuration: 0,
        minDuration: 0,
        maxDuration: 0,
        percentiles: { p50: 0, p75: 0, p90: 0, p95: 0, p99: 0 },
      };
    }

    const durations = results.map(r => r.duration).sort((a, b) => a - b);

    const calculatePercentile = (p: number): number => {
      const index = Math.ceil((p / 100) * durations.length) - 1;
      return durations[Math.max(0, index)];
    };

    return {
      averageDuration: durations.reduce((sum, d) => sum + d, 0) / durations.length,
      minDuration: durations[0],
      maxDuration: durations[durations.length - 1],
      percentiles: {
        p50: calculatePercentile(50),
        p75: calculatePercentile(75),
        p90: calculatePercentile(90),
        p95: calculatePercentile(95),
        p99: calculatePercentile(99),
      },
    };
  }

  /**
   * Format duration
   */
  private static formatDuration(milliseconds: number): string {
    if (milliseconds < 1000) {
      return `${milliseconds}ms`;
    } else if (milliseconds < 60000) {
      return `${(milliseconds / 1000).toFixed(2)}s`;
    } else {
      const minutes = Math.floor(milliseconds / 60000);
      const seconds = ((milliseconds % 60000) / 1000).toFixed(2);
      return `${minutes}m ${seconds}s`;
    }
  }

  /**
   * Ensure output directory exists
   */
  private static ensureOutputDir(outputDir: string): void {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  }

  /**
   * Calculate coverage metrics
   */
  static calculateCoverage(
    totalScenarios: number,
    coveredScenarios: number
  ): CoverageMetrics {
    return {
      scenarios: coveredScenarios,
      userJourneys: Math.floor(coveredScenarios * 0.6),
      edgeCases: Math.floor(coveredScenarios * 0.4),
      total: totalScenarios,
      percentage: (coveredScenarios / totalScenarios) * 100,
    };
  }

  /**
   * Generate JUnit XML report for CI/CD integration
   */
  static generateJUnitReport(
    report: TestReport,
    outputDir: string
  ): void {
    const testCases = report.results.map(result => {
      return `
    <testcase name="${result.scenario}" time="${result.duration / 1000}">
      ${result.error ? `
      <failure message="${this.escapeXml(result.error.message)}">
        ${this.escapeXml(result.error.stack || result.error.message)}
      </failure>
      ` : ''}
    </testcase>`;
    }).join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="E2E Tests" time="${report.duration / 1000}" tests="${report.summary.total}" failures="${report.summary.failed}" skipped="${report.summary.skipped}">
  <testsuite name="E2E Test Suite" time="${report.duration / 1000}" tests="${report.summary.total}" failures="${report.summary.failed}" skipped="${report.summary.skipped}">
    ${testCases}
  </testsuite>
</testsuites>`;

    const outputPath = path.join(outputDir, `junit-e2e-${Date.now()}.xml`);
    fs.writeFileSync(outputPath, xml);
    console.log(`✓ JUnit report generated: ${outputPath}`);
  }

  /**
   * Escape XML special characters
   */
  private static escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
