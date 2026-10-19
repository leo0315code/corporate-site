<?php
declare(strict_types=1);

namespace app;

/**
 * 应用请求对象类
 */
class Request extends \think\Request
{
    /**
     * 全局过滤规则（可按需扩展）
     * @var array
     */
    protected $filter = [];
}
