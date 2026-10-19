<?php
declare(strict_types=1);

namespace app\command;

use think\console\Command;
use think\console\Input;
use think\console\input\Option;
use think\console\Output;
use think\facade\Db;

/**
 * 操作日志清理命令 `php think oplog:clean`
 *
 * 语义（PRD §8 / 架构文档 §6）：
 * - 按 `created_at < now - days` **分批**删除（每批 ≤ limit），循环至删完；
 * - **幂等**：可重复执行，无匹配行时删除 0 条并正常退出（退出码 0）；
 * - **不写日志**：清理自身不落 op_log（否则自指膨胀，PRD §8.2）；
 * - 打印本批与总删除条数，供运维留痕。
 *
 * 参数：
 * - `--days`  ：保留天数，默认取 `cms.oplog_retain_days`（环境变量 OPLOG_RETAIN_DAYS，再默认 180）；
 * - `--limit` ：单批删除上限，默认 5000。
 */
class OpLogClean extends Command
{
    /**
     * 配置命令
     * @return void
     */
    protected function configure(): void
    {
        $this->setName('oplog:clean')
            ->addOption('days', 'd', Option::VALUE_OPTIONAL, '保留天数（默认取 OPLOG_RETAIN_DAYS 或 180）', null)
            ->addOption('limit', 'l', Option::VALUE_OPTIONAL, '单批删除上限', 5000)
            ->setDescription('清理操作日志：删除 created_at 早于保留期的记录（幂等、分批、打印条数）');
    }

    /**
     * 执行命令
     * @param Input  $input
     * @param Output $output
     * @return int 0=成功，1=参数非法
     */
    protected function execute(Input $input, Output $output): int
    {
        $daysRaw = $input->getOption('days');
        $days    = ($daysRaw === null || $daysRaw === '')
            ? (int) config('cms.oplog_retain_days', 180)
            : (int) $daysRaw;
        $limit   = max(1, (int) ($input->getOption('limit') ?? 5000));

        if ($days < 1) {
            $output->writeln('<error>保留天数必须 ≥ 1</error>');
            return 1;
        }

        $before = date('Y-m-d H:i:s', strtotime("-{$days} days"));
        $output->writeln(sprintf('<comment>开始清理：截止 %s，保留 %d 天，单批上限 %d 条</comment>', $before, $days, $limit));

        $total = 0;
        do {
            // DELETE ... ORDER BY id ASC LIMIT n（MySQL 支持 DELETE 带 LIMIT）
            $n = Db::name('op_log')
                ->where('created_at', '<', $before)
                ->order('id', 'asc')
                ->limit($limit)
                ->delete();
            $n      = (int) $n;
            $total += $n;
            $output->writeln("<comment>本批删除 {$n} 条…</comment>");
        } while ($n >= $limit);

        $output->writeln("<info>清理完成：截止 {$before}，共删除 {$total} 条</info>");

        return 0;
    }
}
