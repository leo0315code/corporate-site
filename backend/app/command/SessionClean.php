<?php
declare(strict_types=1);

namespace app\command;

use app\model\AdminSession;
use think\console\Command;
use think\console\Input;
use think\console\input\Option;
use think\console\Output;
use think\facade\Db;

/**
 * 会话清理命令 `php think session:clean`
 *
 * 背景：`admin_session` 只增不删（登出仅删当前 Token），过期记录会持续堆积；
 * `login_attempt` 的失败计数同样长期留存。二者均应随定时任务回收。
 *
 * 语义（幂等、可重复执行）：
 * - 删除 `admin_session.expires_at <= now` 的过期会话；
 * - 删除 `login_attempt` 中「未锁定且最后失败时间早于 keep-days」的历史计数；
 * - 不写 op_log（清理自身不应污染审计流水）。
 *
 * 参数：
 * - `--keep-days`：登录失败计数保留天数，默认 7（锁定期内的记录一定保留）。
 */
class SessionClean extends Command
{
    /**
     * 配置命令
     * @return void
     */
    protected function configure(): void
    {
        $this->setName('session:clean')
            ->addOption('keep-days', 'k', Option::VALUE_OPTIONAL, '登录失败计数保留天数（默认 7）', 7)
            ->setDescription('清理过期管理员会话与历史登录失败计数（幂等）');
    }

    /**
     * 执行命令
     * @param Input  $input
     * @param Output $output
     * @return int 0=成功，1=参数非法
     */
    protected function execute(Input $input, Output $output): int
    {
        $keepDays = (int) ($input->getOption('keep-days') ?? 7);

        if ($keepDays < 1) {
            $output->writeln('<error>keep-days 必须 ≥ 1</error>');
            return 1;
        }

        $now = date('Y-m-d H:i:s');

        // 1) 过期会话
        $sessions = AdminSession::purgeExpired();
        $output->writeln("<info>过期会话已清理：{$sessions} 条（截止 {$now}）</info>");

        // 2) 历史登录失败计数（锁定期内的不动）
        $before    = date('Y-m-d H:i:s', strtotime("-{$keepDays} days"));
        $attempts  = (int) Db::name('login_attempt')
            ->where(function ($q) use ($before) {
                $q->whereNull('locked_until')->whereOr('locked_until', '<', $before);
            })
            ->where('last_failed_at', '<', $before)
            ->delete();

        $output->writeln("<info>历史失败计数已清理：{$attempts} 条（早于 {$before}）</info>");

        return 0;
    }
}
