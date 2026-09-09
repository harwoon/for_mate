import { Link } from "react-router-dom"
import "../../css/components.css"

export default function Breadcrumb({ items = [] }) {
    if (items.length === 0) return null

    return (
        <nav className="breadcrumb" aria-label="현재 위치">
            <ol className="breadcrumb-list">
                {items.map((item, index) => {
                    const isCurrent = index === items.length - 1

                    return (
                        <li
                            key={`${item.label}-${index}`}
                            className="breadcrumb-item"
                        >
                            {index > 0 && (
                                <span
                                    className="breadcrumb-separator"
                                    aria-hidden="true"
                                >
                                    &gt;
                                </span>
                            )}

                            {isCurrent || !item.to ? (
                                <span
                                    className="breadcrumb-current"
                                    aria-current={isCurrent ? "page" : undefined}
                                >
                                    {item.label}
                                </span>
                            ) : (
                                <Link
                                    to={item.to}
                                    className="breadcrumb-link"
                                >
                                    {item.label}
                                </Link>
                            )}
                        </li>
                    )
                })}
            </ol>
        </nav>
    )
}