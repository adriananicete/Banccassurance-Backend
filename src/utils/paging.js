export const MAX_PAGE_SIZE = 100;

export const paging = (query = {}, defaultPageSize = 20) => {
  let page = parseInt(query.page, 10);
  if (isNaN(page) || page < 1) page = 1;

  let pageSize = parseInt(query.pageSize, 10);
  if (isNaN(pageSize) || pageSize < 1) pageSize = defaultPageSize;
  if (pageSize > MAX_PAGE_SIZE) pageSize = MAX_PAGE_SIZE;

  return { PageNumber: page, PageSize: pageSize };
};
