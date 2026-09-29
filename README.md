# ФАЛЬКОН: PyTorch + FAISS

Рабочий инференс и экспорт артефактов Open-set Vehicle ReID. Исходные frontend и
`evaluate.py` скопированы из предоставленных файлов; исходники на Desktop не изменены.

## Запуск

```sh
docker compose up --build
```

Открыть http://localhost:3000, API и Swagger: http://localhost:8000/docs.
Первый запуск ждёт индексации галереи; frontend запускается после успешного healthcheck.
Сборка требует интернета для базовых образов, пакетов и публичных весов. Инференс
после сборки не загружает ничего из сети. Веса включаются в образ, а не скачиваются
при старте API. `weights/resnet18.pth`, если уже подготовлен, используется при сборке.

Локальный `.env` указывает на предоставленный каталог фотографий на Desktop.
При переносе на сервер замените его на содержимое `.env.example` и разместите
фотографии в `images/`. CSV уже скопированы в корень. Bind mount фотографий доступен
только для чтения; отсутствие каталога считается ошибкой.

```text
backend/                  модель, загрузка данных, поиск, API, Dockerfile.backend
frontend/                 предоставленный React UI с обработкой отсутствующих метаданных
images/                   фотографии (либо внешний каталог через FALCON_IMAGES_DIR)
weights/resnet18.pth       веса модели, создаются prepare_weights.py
train.csv                 необязательные метаданные по точному image_id
test_query.csv            порядок запросов и BBox
test_gallery.csv          порядок галереи и BBox
artifacts/                результат CLI
```

В API галерея выбирается `GALLERY_CSV` (по умолчанию `test_gallery.csv`), а не всеми
картинками подряд: так query и train не попадают в тестовую галерею. Для индексации
всех изображений задайте `GALLERY_CSV` пустой строкой. `METADATA_CSV` обогащает данные
по точному image_id; неизвестные vehicle_id/camera_id/timestamp возвращаются как null.
Никакие ID идентичностей, камеры, времена съёмки и Grad-CAM не выдумываются.
Изображение кандидата — Base64 JPEG-превью соответствующего кропа.

## Артефакты соревнования

После запуска сервисов:

```sh
docker compose exec backend python generate_submission.py --output /app/artifacts
```

Или автономно, без запуска веб-сервиса (после сборки образа):

```sh
docker compose run --rm --no-deps backend python generate_submission.py --output /app/artifacts
```

Локальный запуск с Python 3.10+:

```sh
python -m pip install -r backend/requirements.txt
python prepare_weights.py
python generate_submission.py --images images --query test_query.csv --gallery test_gallery.csv --threshold 0.72 --batch-size 16 --output artifacts
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

Локальный Python не читает `.env` автоматически: передайте `--images` CLI или
переменную окружения `IMAGES_DIR` API. Запускать команды из корня проекта.

* `submission.csv`: без заголовка, все query в порядке CSV и ровно 10 различных
  gallery_id. Галерея меньше 10 изображений приводит к явной ошибке.
* `candidates.csv`: заголовок `query_id,gallery_id,confidence`. Если лучший cosine
  score < 0.72, строк для query нет. Иначе записываются все 10 кандидатов, как в API;
  порог применяется на уровне запроса, а не каждой пары. Confidence — cosine score,
  а не калиброванная вероятность.
* `embeddings.npy`: float32, `(N_query + N_gallery, 512)`, сначала query, затем gallery,
  строго в порядке исходных CSV. Все векторы L2-нормализованы.

Обработка пакетная; embeddings сохраняются через memory map, матрица всех попарных
сходств не создаётся. Совпадающие FAISS scores разрешаются порядком строк галереи,
включая ничьи на границе top-10. Junk-фильтрация выполняется организатором: закрытые
test vehicle_id/camera_id недоступны и не угадываются. Ранжирование не удаляет все
объекты той же камеры и не использует train-идентичности как тестовые метки.

Вызов предоставленного evaluator при наличии ground truth:

```sh
python evaluate.py --gt test_ground_truth.csv --submission artifacts/submission.csv --candidates artifacts/candidates.csv --embeddings artifacts/embeddings.npy --query test_query.csv --gallery test_gallery.csv --json artifacts/report.json
```

## Модель и ограничения качества

Используется torchvision ResNet18 с публичными весами ImageNet-1K V1, без последнего
классификатора. Global average pooling даёт 512 измерений; случайной проекционной
головы нет. Resize 256×256, RGB ToTensor, ImageNet Normalize, L2-нормализация.
CSV BBox и API BBox обрабатываются одинаково: дробные края округляются наружу,
пересечение с кадром обрезается по его границам, пустые/невалидные BBox отклоняются.
EXIF-поворот не применяется: координаты относятся к исходным пикселям.

Это воспроизводимый базовый extractor, не модель, обученная на vehicle ReID.
Порог 0.72 задан пользователем; он не откалиброван по данным. Ни качество метрик,
ни надёжное распознавание неизвестных ТС этим значением не гарантируются. Для
соревновательного качества нужны обучение на train и валидация на отложенных
идентичностях. Сервис поддерживает `MODEL_WEIGHTS`/`--weights`: полный state_dict
torchvision ResNet18 с исходной fc (1000 классов), которая удаляется после загрузки.
Никакого анализа номеров или лиц в пайплайне нет.

`DEVICE=auto` выбирает CUDA при наличии поддержки в PyTorch, иначе CPU. Docker по
умолчанию содержит CPU-сборку PyTorch для переносимости. Для GPU нужны CUDA-сборка
совместимых torch/torchvision, NVIDIA Container Toolkit и GPU passthrough; один
`DEVICE=cuda` не превращает CPU-образ в GPU-образ. FAISS остаётся CPU-индексом.

API ограничивает top_k до 100, загрузку до 20 MiB, декодируемое изображение до
25 мегапикселей. Один запрос выполняет инференс, конкурентный получает 503 с
Retry-After. Невалидные данные возвращают 422, превышение размера — 413.
Lifespan прекращает запуск при отсутствующем или повреждённом элементе галереи,
чтобы не смещать соответствие индекса и метаданных.

UI сохраняет явные демонстрационные сценарии исходного проекта; сбой реального
запроса с выбранным файлом больше не подменяется сгенерированными совпадениями.
Демонстрационные результаты явно помечены. В UI убраны неподтверждённые показатели
FPS и размера галереи; вместо подтверждения идентичности показывается сходство.
Кнопки справки об артефактах направляют к CLI: интерактивный поиск не создаёт
submission для полного тестового набора.

## Проверки

```sh
python -m pip install pytest==8.3.5 httpx==0.28.1
python prepare_weights.py
python -m pytest -q
```

Тесты используют реальную модель и FAISS, проверяют API, отказ и равенство порогу,
ошибочные BBox/файлы/параметры, лимиты, ничьи и форматы через `evaluate.py`.
Тестовые изображения синтетические; эти проверки не оценивают качество ReID.

Проверено в текущей среде: 3 теста прошли, production-сборка фронтенда прошла,
`pip check` не выявил нарушенных зависимостей; пути всех 1110 query и 750 gallery
разрешены. После установки WSL контейнеры запущены: backend имеет статус healthy,
frontend доступен на порту 3000; GET /api/v1/health возвращает status=ok,
engine="PyTorch + FAISS", dimension=512. В Windows-окружении этих wheels обнаружен конфликт двух OpenMP
runtime (OMP Error #15). Диагностические тесты запущены с временным
`KMP_DUPLICATE_LIB_OK=TRUE`; это неподдерживаемый обход, не настройка для эксплуатации
и не часть кода/Compose. Для эксплуатации и итоговой проверки используйте Linux
Docker-окружение. Само наличие прошедших тестов с обходом не подтверждает
совместимость нативного Windows-окружения.

Полный диагностический прогон приложенных данных выполнен: `artifacts/` содержит
готовые три файла и `validation.json`. Проверены 1110 строк submission, по 10
различных кандидатов, порядок query/gallery, float32 и форма `(1860, 512)`,
L2-нормы и согласованность ранжирования с косинусным сходством эмбеддингов.
Максимальное отклонение нормы от 1: `1.79e-7`. При пороге 0.72 базовая модель
приняла все 1110 запросов (0 отказов). Это наблюдение не подтверждает качество:
test ground truth отсутствует, метрики не рассчитаны. Порог оставлен заданным;
для содержательного open-set режима нужны ReID-обучение и калибровка на валидации.

Источники: [torchvision ResNet](https://docs.pytorch.org/vision/main/_modules/torchvision/models/resnet.html),
[публичные веса](https://download.pytorch.org/models/resnet18-f37072fd.pth),
[FAISS: cosine similarity](https://github.com/facebookresearch/faiss/wiki/MetricType-and-distances).
