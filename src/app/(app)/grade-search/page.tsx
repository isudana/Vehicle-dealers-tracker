const GRADE_SEARCH_SITES: { make: string; url: string }[] = [
  { make: "Toyota", url: "https://www.toyota.co.jp/grade/dc/top" },
  { make: "Honda", url: "https://grade.customer.honda.co.jp/apps/grade/hccg0010201/search" },
  { make: "Mazda", url: "https://www2.mazda.co.jp/grade-search/" },
  { make: "Suzuki", url: "https://sgre.suzuki.co.jp/SearchGrade" },
  { make: "Mitsubishi", url: "https://inquiry.mitsubishi-motors.co.jp/reference/GradeSearch.do" },
  { make: "Nissan", url: "https://grade-search.nissan.co.jp/GRADE/search.html" },
];

export default function GradeSearchPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Grade Search</h1>
        <p className="mt-1 text-sm text-gray-500">
          Official manufacturer portals for checking a vehicle&apos;s grade/trim from its chassis
          number. Pick the make below and look it up on the manufacturer&apos;s own site.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {GRADE_SEARCH_SITES.map((site) => (
          <a
            key={site.make}
            href={site.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 hover:border-gray-400"
          >
            <span className="font-medium text-gray-900">{site.make}</span>
            <span className="text-sm text-gray-400">Open ↗</span>
          </a>
        ))}
      </div>
    </div>
  );
}
