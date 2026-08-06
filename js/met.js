/* MET 代谢当量表（来源：Compendium of Physical Activities 常用值）
   消耗 kcal = MET × 体重(kg) × 时长(小时) */

const MET_TABLE = [
  { name: '散步（慢）', met: 3.0 },
  { name: '快走', met: 4.3 },
  { name: '慢跑', met: 7.0 },
  { name: '跑步（8km/h）', met: 8.3 },
  { name: '跑步（10km/h）', met: 9.8 },
  { name: '骑行（休闲）', met: 4.0 },
  { name: '骑行（中等强度）', met: 6.8 },
  { name: '游泳（一般）', met: 6.0 },
  { name: '游泳（自由泳较快）', met: 8.3 },
  { name: '跳绳', met: 11.0 },
  { name: '椭圆机', met: 5.0 },
  { name: '动感单车', met: 8.5 },
  { name: '划船机', met: 7.0 },
  { name: '力量训练（适度）', met: 3.5 },
  { name: '力量训练（高强度）', met: 6.0 },
  { name: '瑜伽', met: 2.5 },
  { name: '普拉提', met: 3.0 },
  { name: '拉伸', met: 2.3 },
  { name: '有氧操/舞蹈', met: 5.0 },
  { name: '拳击/搏击操', met: 7.8 },
  { name: '羽毛球', met: 5.5 },
  { name: '乒乓球', met: 4.0 },
  { name: '网球', met: 7.3 },
  { name: '篮球', met: 6.5 },
  { name: '足球', met: 7.0 },
  { name: '排球', met: 4.0 },
  { name: '登山/徒步', met: 6.0 },
  { name: '爬楼梯', met: 8.0 },
  { name: '太极', met: 3.0 },
  { name: '家务劳动', met: 3.3 },
];

/* 计算运动消耗，体重 kg，时长 分钟 */
function calcBurn(met, weightKg, minutes) {
  const hours = minutes / 60;
  return Math.round(met * weightKg * hours);
}

function metByName(name) {
  const item = MET_TABLE.find(x => x.name === name);
  return item ? item.met : 0;
}
